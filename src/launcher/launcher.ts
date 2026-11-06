import { styleText } from "node:util";
import { readConfigSync } from "../config.ts";
import { start, stop } from "../menubar/commands.ts";
import { listMedeaItems } from "../medea-apps/registry.ts";
import type { LauncherItem } from "../medea-apps/types.ts";
import { isMenuBarRunning } from "../menubar/helper.ts";
import { listenForRequests } from "../terminals/running-cli.ts";
import { listApps, openApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { renderBanner } from "./banner.ts";
import { formatHotkey } from "./hotkeys.ts";
import { runItemSettings } from "./item-settings.ts";
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

type GetItems = () => LauncherItem[];

interface RoundResult {
  keepRunning: boolean;
  notice: string;
}

const NO_NOTICE = "";

const formatRow = (
  { icon, name, kind }: LauncherItem,
  aliases: readonly string[],
  hotkey: string,
): string => {
  const tags = aliases.map((alias) => `[${alias}]`).join(" ");
  const symbols = formatHotkey(hotkey);
  const plainParts = [name, tags, symbols].filter((part) => part !== "");
  const padding = " ".repeat(Math.max(1, TITLE_COLUMN_WIDTH - plainParts.join(" ").length));
  const styledParts = [
    name,
    tags === "" ? "" : styleText("cyan", tags),
    symbols === "" ? "" : styleText("yellow", symbols),
  ].filter((part) => part !== "");
  return `${icon} ${styledParts.join(" ")}${padding}${styleText("gray", kind)}`;
};

const withoutNotice = (run: () => Promise<void>) => async (): Promise<string> => {
  await run();
  return NO_NOTICE;
};

const toAppItem = ({ name, path }: App): LauncherItem => ({
  value: path,
  name,
  icon: APP_ICON,
  kind: "Application",
  run: withoutNotice(() => openApp(path)),
});

const toCommandItem = (value: string, name: string, run: () => Promise<void>): LauncherItem => ({
  value,
  name,
  icon: COMMAND_ICON,
  kind: "Command",
  run: withoutNotice(run),
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

const drawScreen = (notice = NO_NOTICE): void => {
  const noticeLine = notice === NO_NOTICE ? "" : `\n  ${notice}\n`;
  process.stdout.write(
    `${CLEAR_SCREEN_SEQUENCE}${renderBanner(process.stdout.columns)}${noticeLine}`,
  );
};

// Settings are read on every call, so one saved by a hotkey's window shows here straight away.
const toOptions = (items: readonly LauncherItem[]): LauncherOption[] => {
  const { aliases, hotkeys } = readConfigSync();
  return items.map((item) => {
    const itemAliases = aliases[item.value] ?? [];
    const label = formatRow(item, itemAliases, hotkeys[item.value] ?? "");
    return { ...item, aliases: itemAliases, label };
  });
};

// A link that fails to open shouldn't take the search window down with it.
const showErrorsAsNotice = async (run: () => Promise<string>): Promise<string> => {
  try {
    return await run();
  } catch (error) {
    return styleText("red", error instanceof Error ? error.message : String(error));
  }
};

const openSettingsFor = async (items: readonly LauncherItem[], value?: string): Promise<string> => {
  const item = items.find((candidate) => candidate.value === value);
  if (item === undefined) {
    return NO_NOTICE;
  }
  drawScreen();
  return showErrorsAsNotice(withoutNotice(() => runItemSettings(item.value, item.name)));
};

const pickItemForAlias = async (getItems: GetItems): Promise<string> => {
  drawScreen();
  const { value } = await promptForSelection(() => toOptions(getItems()), PICK_ITEM_PLACEHOLDER);
  return openSettingsFor(getItems(), value);
};

/** Shows the search bar once. */
const runSearchRound = async (notice: string): Promise<RoundResult> => {
  drawScreen(notice);
  const [menuBarRunning, apps] = await Promise.all([isMenuBarRunning(), listApps()]);
  const fixedItems = buildCommandItems(menuBarRunning);
  const appItems = apps.map(toAppItem);
  const getItems: GetItems = () => [...fixedItems, ...listMedeaItems(), ...appItems];

  const { cancelled, value, wantsSettings } = await promptForSelection(
    () => toOptions(getItems()),
    SEARCH_PLACEHOLDER,
  );
  if (cancelled || (value === EXIT_VALUE && !wantsSettings)) {
    return { keepRunning: false, notice: NO_NOTICE };
  }
  if (wantsSettings) {
    return { keepRunning: true, notice: await openSettingsFor(getItems(), value) };
  }
  if (value === SET_ALIAS_VALUE) {
    return { keepRunning: true, notice: await pickItemForAlias(getItems) };
  }
  const item = getItems().find((candidate) => candidate.value === value);
  const nextNotice = item === undefined ? NO_NOTICE : await showErrorsAsNotice(item.run);
  return { keepRunning: true, notice: nextNotice };
};

// Stays open after each action so the shortcut can bring this same window back.
export const runLauncher = async (): Promise<void> => {
  const stopListening = await listenForRequests();
  try {
    let round: RoundResult = { keepRunning: true, notice: NO_NOTICE };
    while (round.keepRunning) {
      round = await runSearchRound(round.notice);
    }
  } finally {
    stopListening();
  }
};
