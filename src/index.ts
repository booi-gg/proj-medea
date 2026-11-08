#!/usr/bin/env node
import { flushCompileCache } from "node:module";
import { buffer, text } from "node:stream/consumers";
import { withAction } from "./log.ts";

const VERSION_COMMANDS = new Set(["--version", "-v", "version"]);

const PROCESS_COMMANDS = new Set([
  "show",
  "hotkeys",
  "run",
  "run-in-window",
  "record-clipboard",
  "record-clipboard-image",
  "start",
  "stop",
  "status",
  "sign",
  "logs",
  "sync",
  "update-status",
  "update",
  "update-in-window",
  "restart",
]);

const toProcessKind = (command: string | undefined): string => {
  if (command === undefined) {
    return "search";
  }
  if (VERSION_COMMANDS.has(command)) {
    return "version";
  }
  return PROCESS_COMMANDS.has(command) ? command : "unknown";
};

// Each command loads only what it uses, because the helper starts this on every copy and hotkey.
const main = async (): Promise<void> => {
  const [command, argument] = process.argv.slice(2);

  if (command === undefined) {
    const { runLauncher } = await import("./launcher/launcher.ts");
    // Node saves the cache on a clean exit, and closing the window isn't one.
    flushCompileCache();
    // Runs beside search, so it never holds up the first screen.
    const { repairTerminalProfiles } = await import("./terminals/profile-repair.ts");
    const profileRepair = repairTerminalProfiles();
    await runLauncher();
    await profileRepair;
    return;
  }
  if (command === "show") {
    const { showCli } = await import("./terminals/actions.ts");
    await showCli();
    return;
  }
  if (command === "hotkeys") {
    const { readConfig } = await import("./config.ts");
    const { toHelperHotkeys } = await import("./launcher/hotkeys.ts");
    const { withoutRemovedItems } = await import("./redhot-apps/registry.ts");
    const { hotkeys } = await readConfig();
    process.stdout.write(`${JSON.stringify(toHelperHotkeys(withoutRemovedItems(hotkeys)))}\n`);
    return;
  }
  if (command === "run") {
    const { runCommandItem } = await import("./terminals/actions.ts");
    await runCommandItem(argument);
    return;
  }
  if (command === "run-in-window") {
    const { runLauncher } = await import("./launcher/launcher.ts");
    const { runInRunningCli } = await import("./terminals/running-cli.ts");
    // Two quick presses can both find nothing open, so the later window hands over and leaves.
    const hasHandedOver = argument !== undefined && (await runInRunningCli(argument));
    if (!hasHandedOver) {
      flushCompileCache();
      await runLauncher(argument);
    }
    return;
  }
  // Text comes through stdin because arguments can be read by anyone running "ps".
  if (command === "record-clipboard") {
    const { recordText } = await import("./redhot-apps/redhot-clipboard-history/store.ts");
    await recordText(await text(process.stdin));
    return;
  }
  if (command === "record-clipboard-image") {
    const { recordImage } = await import("./redhot-apps/redhot-clipboard-history/store.ts");
    await recordImage(await buffer(process.stdin), process.env.REDHOT_IMAGE_NAME);
    return;
  }
  if (command === "logs") {
    const { showLogs } = await import("./log-viewer.ts");
    await showLogs(process.argv.slice(3));
    return;
  }
  if (command === "sync") {
    const { openSyncFolder, readSyncStatus, syncNow } = await import("./sync/sync.ts");
    if (argument === "now") {
      process.stdout.write(`${JSON.stringify(await syncNow())}\n`);
    } else if (argument === "status" || argument === undefined) {
      process.stdout.write(`${JSON.stringify(await readSyncStatus(), null, 2)}\n`);
    } else if (argument === "open") {
      await openSyncFolder();
    } else {
      throw new Error("Usage: redhot sync [now|status|open]");
    }
    return;
  }

  if (command === "update-status") {
    const { checkForUpdate } = await import("./update/update-check.ts");
    const status = await checkForUpdate({ force: argument === "--now" });
    process.stdout.write(`${JSON.stringify(status)}\n`);
    return;
  }
  if (command === "update") {
    const { openUpdateWindow } = await import("./terminals/actions.ts");
    await openUpdateWindow();
    return;
  }
  if (command === "update-in-window") {
    const { runUpdateInWindow } = await import("./update/update-window.ts");
    await runUpdateInWindow();
    return;
  }
  if (VERSION_COMMANDS.has(command)) {
    const { readVersion } = await import("./version.ts");
    process.stdout.write(`${await readVersion()}\n`);
    return;
  }

  const { intro } = await import("@clack/prompts");
  const { restart, showStatus, sign, start, stop } = await import("./menubar/commands.ts");
  intro("redhot");
  if (command === "start") {
    await start();
    return;
  }
  if (command === "stop") {
    await stop();
    return;
  }
  if (command === "restart") {
    await restart();
    return;
  }
  if (command === "status") {
    await showStatus();
    return;
  }
  if (command === "sign") {
    await sign();
    return;
  }
  throw new Error(
    `Unknown command "${command}". Use start, stop, restart, status, sign or --version.`,
  );
};

try {
  const command = process.argv[2];
  const kind = toProcessKind(command);
  const closesOwnWindow =
    command === undefined || command === "run-in-window" || command === "update-in-window";
  await withAction("process.run", { kind, interactive: closesOwnWindow }, main);
  if (closesOwnWindow) {
    const { closeOwnWindow } = await import("./terminals/close-window.ts");
    await closeOwnWindow();
  }
} catch (error) {
  const { log } = await import("@clack/prompts");
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
