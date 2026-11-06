#!/usr/bin/env node
import { cancel, intro, isCancel, log, outro, select, spinner } from "@clack/prompts";
import { isMenuBarRunning, startMenuBar, stopMenuBar } from "./menubar.ts";

const start = async (): Promise<void> => {
  const progress = spinner();
  progress.start("Starting the menu bar item");
  try {
    await startMenuBar();
    progress.stop("Menu bar item is running");
  } catch (error) {
    progress.stop("Could not start the menu bar item");
    throw error;
  }
};

const stop = async (): Promise<void> => {
  await stopMenuBar();
  log.success("Menu bar item stopped");
};

const showStatus = async (): Promise<void> => {
  const running = await isMenuBarRunning();
  log.info(`Menu bar item is ${running ? "running" : "stopped"}`);
};

const runInteractive = async (): Promise<void> => {
  const running = await isMenuBarRunning();
  const action = await select({
    message: "What do you want to do?",
    options: [
      running
        ? { value: "stop", label: "Remove the menu bar item" }
        : { value: "start", label: "Add the menu bar item" },
      { value: "exit", label: "Exit" },
    ],
  });

  if (isCancel(action)) {
    cancel("Cancelled");
    return;
  }
  if (action === "start") {
    await start();
  }
  if (action === "stop") {
    await stop();
  }
  outro("Done");
};

const main = async (): Promise<void> => {
  const [command] = process.argv.slice(2);
  intro("supercast");

  if (command === undefined) {
    await runInteractive();
    return;
  }
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
