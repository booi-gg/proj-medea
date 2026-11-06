#!/usr/bin/env node
import { intro, log } from "@clack/prompts";
import { runLauncher } from "./launcher/launcher.ts";
import { showStatus, start, stop } from "./menubar/commands.ts";
import { setTerminal, showCli } from "./terminals/actions.ts";
import { listTerminals } from "./terminals/terminals.ts";

const main = async (): Promise<void> => {
  const [command, argument] = process.argv.slice(2);

  if (command === undefined) {
    await runLauncher();
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
  if (command === "set-terminal") {
    await setTerminal(argument);
    return;
  }

  intro("supercast");
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
