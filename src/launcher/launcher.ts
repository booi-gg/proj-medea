import { styleText } from "node:util";
import { readConfigSync } from "../config.ts";
import { start, stop } from "../menubar/commands.ts";
import { isMenuBarRunning } from "../menubar/helper.ts";
import { openItemSettings } from "../terminals/actions.ts";
import { listenForRequests } from "../terminals/running-cli.ts";
import { listApps, openApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { renderBanner } from "./banner.ts";
import { promptForSelection } from "./prompt.ts";
import type { LauncherOption } from "./prompt.ts";

const TITLE_COLUMN_WIDTH = 40;
const EXIT_VALUE = "command:exit";
const SET_ALIAS_VALUE = "command:set-alias";
const SEARCH_PLACEHOLDER = "Cast actions";
const PICK_ITEM_PLACEHOLDER = "Choose an app or command";
const CLEAR_SCREEN_SEQUENCE = "\u001B[2J\u001B[H";
const APP_ICON = styleText("cyan", "◆");
const COMMAND_ICON = styleText("magenta", "⌘");

interface LauncherItem {
  value: string;
  name: string;
  icon: string;
  kind: string;
  run: () => Promise<void>;
}

const formatRow = ({ icon, name, kind }: LauncherItem, aliases: readonly string[]): string => {
  const tags = aliases.map((alias) => `[${alias}]`).join(" ");
  const visibleWidth = name.length + (tags === "" ? 0 : tags.length + 1);
  const padding = " ".repeat(Math.max(1, TITLE_COLUMN_WIDTH - visibleWidth));
  const title = tags === "" ? name : `${name} ${styleText("cyan", tags)}`;
  return `${icon} ${title}${padding}${styleText("gray", kind)}`;
};

const toAppItem = ({ name, path }: App): LauncherItem => ({
  value: path,
  name,
  icon: APP_ICON,
  kind: "Application",
  run: () => openApp(path),
});

const toCommandItem = (value: string, name: string, run: () => Promise<void>): LauncherItem => ({
  value,
  name,
  icon: COMMAND_ICON,
  kind: "Command",
  run,
});

const doNothing = async (): Promise<void> => {};

const buildCommandItems = (menuBarRunning: boolean): LauncherItem[] => [
  // One value for both states, so an alias survives the item switching between them.
  menuBarRunning
    ? toCommandItem("command:menu-bar", "Remove Menu Bar Item", stop)
    : toCommandItem("command:menu-bar", "Add Menu Bar Item", start),
  toCommandItem(SET_ALIAS_VALUE, "Set Alias", doNothing),
  toCommandItem(EXIT_VALUE, "Exit", doNothing),
];

const drawScreen = (): void => {
  process.stdout.write(`${CLEAR_SCREEN_SEQUENCE}${renderBanner(process.stdout.columns)}`);
};

// Aliases are read on every call, so one saved in a settings window works here straight away.
const toOptions = (items: readonly LauncherItem[]): LauncherOption[] => {
  const { aliases } = readConfigSync();
  return items.map((item) => {
    const itemAliases = aliases[item.value] ?? [];
    return { ...item, aliases: itemAliases, label: formatRow(item, itemAliases) };
  });
};

const openSettingsFor = async (items: readonly LauncherItem[], value?: string): Promise<void> => {
  const item = items.find((candidate) => candidate.value === value);
  if (item !== undefined) {
    await openItemSettings(item.value, item.name);
  }
};

const pickItemForAlias = async (items: readonly LauncherItem[]): Promise<void> => {
  drawScreen();
  const { value } = await promptForSelection(() => toOptions(items), PICK_ITEM_PLACEHOLDER);
  await openSettingsFor(items, value);
};

/** Shows the search bar once. Returns false when the CLI should exit. */
const runSearchRound = async (): Promise<boolean> => {
  drawScreen();
  const [menuBarRunning, apps] = await Promise.all([isMenuBarRunning(), listApps()]);
  const items = [...buildCommandItems(menuBarRunning), ...apps.map(toAppItem)];

  const { cancelled, value, wantsSettings } = await promptForSelection(
    () => toOptions(items),
    SEARCH_PLACEHOLDER,
  );
  if (cancelled) {
    return false;
  }
  if (wantsSettings) {
    await openSettingsFor(items, value);
    return true;
  }
  if (value === EXIT_VALUE) {
    return false;
  }
  if (value === SET_ALIAS_VALUE) {
    await pickItemForAlias(items);
    return true;
  }
  await items.find((item) => item.value === value)?.run();
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
