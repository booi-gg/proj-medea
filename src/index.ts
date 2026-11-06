#!/usr/bin/env node
import { text } from "node:stream/consumers";
import { intro, log } from "@clack/prompts";
import { readConfig } from "./config.ts";
import { toHelperHotkeys } from "./launcher/hotkeys.ts";
import { runLauncher } from "./launcher/launcher.ts";
import { recordText } from "./medea-apps/medea-clipboard-history/store.ts";
import { showStatus, start, stop } from "./menubar/commands.ts";
import { runCommandItem, runItemInWindow, setTerminal, showCli } from "./terminals/actions.ts";
import { closeOwnWindow, offerToCloseWindow } from "./terminals/close-window.ts";
import { listTerminals } from "./terminals/terminals.ts";

const main = async (): Promise<void> => {
  const [command, argument] = process.argv.slice(2);

  if (command === undefined) {
    await runLauncher();
    await offerToCloseWindow();
    return;
  }
  if (command === "show") {
    await showCli();
    return;
  }
  if (command === "terminals") {
    process.stdout.write(`${JSON.stringify(await listTerminals())}\n`);
    return;
  }
  if (command === "hotkeys") {
    const { hotkeys } = await readConfig();
    process.stdout.write(`${JSON.stringify(toHelperHotkeys(hotkeys))}\n`);
    return;
  }
  if (command === "run") {
    await runCommandItem(argument);
    return;
  }
  if (command === "run-in-window") {
    await runItemInWindow(argument);
    await closeOwnWindow();
    return;
  }
  // Text comes through stdin because arguments can be read by anyone running "ps".
  if (command === "record-clipboard") {
    await recordText(await text(process.stdin));
    return;
  }
  if (command === "set-terminal") {
    await setTerminal(argument);
    return;
  }

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
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
