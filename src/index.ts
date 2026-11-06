#!/usr/bin/env node
import { flushCompileCache } from "node:module";
import { buffer, text } from "node:stream/consumers";

// Each command loads only what it uses, because the helper starts this on every copy and hotkey.
const main = async (): Promise<void> => {
  const [command, argument] = process.argv.slice(2);

  if (command === undefined) {
    const { runLauncher } = await import("./launcher/launcher.ts");
    const { offerToCloseWindow } = await import("./terminals/close-window.ts");
    // Node saves the cache on a clean exit, and closing the window isn't one.
    flushCompileCache();
    await runLauncher();
    await offerToCloseWindow();
    return;
  }
  if (command === "show") {
    const { showCli } = await import("./terminals/actions.ts");
    await showCli();
    return;
  }
  if (command === "terminals") {
    const { listTerminals } = await import("./terminals/terminals.ts");
    process.stdout.write(`${JSON.stringify(await listTerminals())}\n`);
    return;
  }
  if (command === "hotkeys") {
    const { readConfig } = await import("./config.ts");
    const { toHelperHotkeys } = await import("./launcher/hotkeys.ts");
    const { hotkeys } = await readConfig();
    process.stdout.write(`${JSON.stringify(toHelperHotkeys(hotkeys))}\n`);
    return;
  }
  if (command === "run") {
    const { runCommandItem } = await import("./terminals/actions.ts");
    await runCommandItem(argument);
    return;
  }
  if (command === "run-in-window") {
    const { runItemInWindow } = await import("./terminals/actions.ts");
    const { closeOwnWindow } = await import("./terminals/close-window.ts");
    await runItemInWindow(argument);
    await closeOwnWindow();
    return;
  }
  // Text comes through stdin because arguments can be read by anyone running "ps".
  if (command === "record-clipboard") {
    const { recordText } = await import("./medea-apps/medea-clipboard-history/store.ts");
    await recordText(await text(process.stdin));
    return;
  }
  if (command === "record-clipboard-image") {
    const { recordImage } = await import("./medea-apps/medea-clipboard-history/store.ts");
    await recordImage(await buffer(process.stdin), process.env.MEDEA_IMAGE_NAME);
    return;
  }
  if (command === "set-terminal") {
    const { setTerminal } = await import("./terminals/actions.ts");
    await setTerminal(argument);
    return;
  }

  const { intro } = await import("@clack/prompts");
  const { showStatus, start, stop } = await import("./menubar/commands.ts");
  intro("medea");
  if (command === "start") {
    await start();
    return;
  }
  if (command === "stop") {
    await stop();
    return;
  }
  if (command === "status") {
    await showStatus();
    return;
  }
  throw new Error(`Unknown command "${command}". Use start, stop or status.`);
};

try {
  await main();
} catch (error) {
  const { log } = await import("@clack/prompts");
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
