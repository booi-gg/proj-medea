#!/usr/bin/env node
import { styleText } from "node:util";
import { autocomplete, cancel, intro, isCancel, log, outro, spinner } from "@clack/prompts";
import { listApps, openApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { isMenuBarRunning, startMenuBar, stopMenuBar } from "./menubar.ts";
import { rankItems } from "./search.ts";

const MAX_VISIBLE_RESULTS = 8;
const NAME_COLUMN_WIDTH = 30;
const APP_ICON = styleText("cyan", "◆");
const COMMAND_ICON = styleText("magenta", "⌘");

interface LauncherItem {
  value: string;
  name: string;
  label: string;
  run: () => Promise<void>;
}

const formatRow = (icon: string, name: string, kind: string): string =>
  `${icon} ${name.padEnd(NAME_COLUMN_WIDTH)} ${styleText("gray", kind)}`;

// rankItems has already chosen the results, so clack's own filter must not remove any.
const keepRankedResult = (): boolean => true;

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

const toAppItem = ({ name, path }: App): LauncherItem => ({
  value: path,
  name,
  label: formatRow(APP_ICON, name, "Application"),
  run: async () => {
    await openApp(path);
    outro(`Opened ${name}`);
  },
});

const toCommandItem = (value: string, name: string, run: () => Promise<void>): LauncherItem => ({
  value,
  name,
  label: formatRow(COMMAND_ICON, name, "Command"),
  run,
});

const buildCommandItems = (menuBarRunning: boolean): LauncherItem[] => [
  menuBarRunning
    ? toCommandItem("command:stop", "Remove Menu Bar Item", stop)
    : toCommandItem("command:start", "Add Menu Bar Item", start),
  toCommandItem("command:exit", "Exit", async () => {}),
];

const runInteractive = async (): Promise<void> => {
  const [menuBarRunning, apps] = await Promise.all([isMenuBarRunning(), listApps()]);
  const items = [...buildCommandItems(menuBarRunning), ...apps.map(toAppItem)];

  let lastQuery = "";

  const selectedValue = await autocomplete({
    message: "Search apps and commands",
    maxItems: MAX_VISIBLE_RESULTS,
    filter: keepRankedResult,
    options() {
      // Clack keeps focus on the old item while it stays listed. Enter must pick the top result.
      if (this.userInput !== lastQuery) {
        lastQuery = this.userInput;
        this.focusedValue = undefined;
      }
      return rankItems(this.userInput, items);
    },
  });

  if (isCancel(selectedValue)) {
    cancel("Cancelled");
    return;
  }
  await items.find(({ value }) => value === selectedValue)?.run();
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
