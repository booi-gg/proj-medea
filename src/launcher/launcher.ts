import { styleText } from "node:util";
import { isCancel } from "@clack/core";
import { start, stop } from "../menubar/commands.ts";
import { isMenuBarRunning } from "../menubar/helper.ts";
import { listenForRequests } from "../terminals/running-cli.ts";
import { listApps, openApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { renderBanner } from "./banner.ts";
import { promptForSelection } from "./prompt.ts";

const NAME_COLUMN_WIDTH = 30;
const EXIT_VALUE = "command:exit";
const CLEAR_SCREEN_SEQUENCE = "\u001B[2J\u001B[H";
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

const toAppItem = ({ name, path }: App): LauncherItem => ({
  value: path,
  name,
  label: formatRow(APP_ICON, name, "Application"),
  run: () => openApp(path),
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
  toCommandItem(EXIT_VALUE, "Exit", async () => {}),
];

/** Shows the search bar once. Returns false when the CLI should exit. */
const runSearchRound = async (): Promise<boolean> => {
  process.stdout.write(`${CLEAR_SCREEN_SEQUENCE}${renderBanner(process.stdout.columns)}`);
  const [menuBarRunning, apps] = await Promise.all([isMenuBarRunning(), listApps()]);
  const items = [...buildCommandItems(menuBarRunning), ...apps.map(toAppItem)];

  const selectedValue = await promptForSelection(items);
  if (isCancel(selectedValue) || selectedValue === EXIT_VALUE) {
    return false;
  }
  await items.find(({ value }) => value === selectedValue)?.run();
  return true;
};

// Stays open after each action so the shortcut can bring this same window back.
export const runLauncher = async (): Promise<void> => {
  const stopListening = await listenForRequests();
  try {
    let keepRunning = true;
    while (keepRunning) {
      keepRunning = await runSearchRound();
    }
  } finally {
    stopListening();
  }
};
