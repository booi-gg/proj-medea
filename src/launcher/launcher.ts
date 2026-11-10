import { styleText } from "node:util";
import { select } from "@clack/prompts";
import { readConfigSync } from "../config.ts";
import { start, stop } from "../menubar/commands.ts";
import { toRedhotIcon } from "../redhot-apps/icon.ts";
import { toCalculationItem } from "../redhot-apps/redhot-calculator/index.ts";
import { calculate } from "../redhot-apps/redhot-calculator/calculate.ts";
import { parseConversion } from "../redhot-apps/redhot-currency/convert.ts";
import { toConversionItems } from "../redhot-apps/redhot-currency/index.ts";
import { refreshRatesIfStale } from "../redhot-apps/redhot-currency/rates.ts";
import {
  FILE_SEARCH_VALUE,
  runFileSearch,
  toFileSearchQuery,
} from "../redhot-apps/redhot-files/index.ts";
import { PORTS_SEARCH_VALUE } from "../redhot-apps/redhot-processes/index.ts";
import { toPort } from "../redhot-apps/redhot-processes/list.ts";
import { runPortScreen } from "../redhot-apps/redhot-processes/screen.ts";
import { DEFINE_VALUE, toDictionaryItem } from "../redhot-apps/redhot-dictionary/index.ts";
import { findRedhotItem, listRedhotItems } from "../redhot-apps/registry.ts";
import { toDateItem, toTimeZoneItem } from "../redhot-apps/redhot-time/index.ts";
import { toTimerItem } from "../redhot-apps/redhot-timer/index.ts";
import { toUnitItem } from "../redhot-apps/redhot-units/index.ts";
import { toAliasSearchItem, toWebSearchItem } from "../redhot-apps/redhot-web-search/index.ts";
import type { LauncherItem } from "../redhot-apps/types.ts";
import { isMenuBarRunning } from "../menubar/helper.ts";
import { withAction, writeLog } from "../log.ts";
import { listenForRequests } from "../terminals/running-cli.ts";
import { listApps, openApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { formatHotkey } from "./hotkeys.ts";
import { ADD_ALIAS_LABEL, CREATE_HOTKEY_LABEL, runItemSettings } from "./item-settings.ts";
import { closeReplaceableList, promptForSelection } from "./prompt.ts";
import type { LauncherOption } from "./prompt.ts";
import { createQueryExit } from "./query-exit.ts";
import { drawScreen, toTerminalWidth } from "./screen.ts";
import { rankItems } from "./search.ts";
import "./select-hint.ts";

const TITLE_COLUMN_WIDTH = 40;
const EXIT_VALUE = "command:exit";
// Saved aliases and hotkeys use this value, so it stays when the command's name changes.
const SET_ALIAS_VALUE = "command:set-alias";
const CREATE_HOTKEY_VALUE = "command:create-hotkey";
const END_PROGRAM_CHOICE = "end-program";
const CANCEL_CHOICE = "cancel";
const SEARCH_PLACEHOLDER = "Search apps and commands";
const PICK_ITEM_PLACEHOLDER = "Choose an app or command";
const APP_ICON = styleText("white", "◆");
const COMMAND_ICON = toRedhotIcon("⌘");
const ACTIVE_SEARCH_ICON = toRedhotIcon("❯");
const NO_MATCHES_OPTION: LauncherOption = {
  value: "command:no-matches",
  name: "",
  aliases: [],
  label: "No results",
  footer: "↓ search the web",
  isInert: true,
};

type GetItems = () => LauncherItem[];

/** A search to show again as it was, after running a row made from what was typed. */
interface KeptSearch {
  query: string;
  focusedValue: string;
}

interface RoundResult {
  keepRunning: boolean;
  notice: string;
  keptSearch?: KeptSearch;
}

/** What this window is doing, which decides how a hotkey pressed elsewhere is answered. */
interface Session {
  runningItem: string | undefined;
  /** Set by a hotkey, and run once the list on screen has closed. */
  nextItem: string | undefined;
  /** A window opened for one item closes with it, unless you've gone on to search. */
  closeWhenDone: boolean;
}

const NO_NOTICE = "";
const ENDING_NOTICE = "Ending program...";

const showEndingScreen = (): void => {
  drawScreen({ notice: ENDING_NOTICE });
};

const endProgram = (): RoundResult => {
  showEndingScreen();
  return { keepRunning: false, notice: NO_NOTICE };
};

const formatRow = (
  { icon, name, kind }: LauncherItem,
  aliases: readonly string[],
  hotkey: string,
): string => {
  const tags = aliases.map((alias) => `[${alias}]`).join(" ");
  const symbols = formatHotkey(hotkey);
  const plainParts = [name, tags, symbols].filter((part) => part !== "");
  // Measured on screen, so a wide emoji icon or name doesn't push the kind out of line.
  const usedWidth = toTerminalWidth(plainParts.join(" ")) + toTerminalWidth(icon) - 1;
  const padding = " ".repeat(Math.max(1, TITLE_COLUMN_WIDTH - usedWidth));
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
    ? toCommandItem("command:menu-bar", 'Remove "Redhot" from Menu Bar', stop)
    : toCommandItem("command:menu-bar", 'Add "Redhot" to Menu Bar', start),
  toCommandItem(SET_ALIAS_VALUE, ADD_ALIAS_LABEL, doNothing),
  toCommandItem(CREATE_HOTKEY_VALUE, CREATE_HOTKEY_LABEL, doNothing),
  toCommandItem(EXIT_VALUE, "Exit", doNothing),
];

// Settings are read on every call, so one saved by a hotkey's window shows here straight away.
const toOptions = (items: readonly LauncherItem[]): LauncherOption[] => {
  const { aliases, hotkeys } = readConfigSync();
  return items.map((item) => {
    const itemAliases = aliases[item.value] ?? [];
    const label = formatRow(item, itemAliases, hotkeys[item.value] ?? "");
    return { ...item, aliases: itemAliases, label };
  });
};

const toAnswerItems = (query: string): LauncherItem[] => {
  const unitItem = toUnitItem(query);
  // "5 miles to km" has the shape of a currency conversion too, and would say rates are missing.
  const conversions = unitItem === undefined ? toConversionItems(query) : [unitItem];
  return [
    toCalculationItem(query),
    ...conversions,
    toTimeZoneItem(query),
    toDateItem(query),
    toTimerItem(query),
    toAliasSearchItem(query),
    toDictionaryItem(query),
  ].filter((item) => item !== undefined);
};

const toAnswerOption = (item: LauncherItem): LauncherOption => ({
  ...item,
  aliases: [],
  label: formatRow(item, [], ""),
});

// Answers come from the query, so they go above ordinary search results. When there's no answer and
// no result, the web is offered a row down from where focus starts, so a stray Enter can't send what
// was typed to a search engine. A dictionary row doesn't know the word exists, so the web stays on
// offer below it.
export const rankWithAnswers = (
  query: string,
  options: readonly LauncherOption[],
  answers: readonly LauncherItem[] = toAnswerItems(query),
): LauncherOption[] => {
  const results = rankItems(query, options);
  const foundNothing = results.length === 0 && answers.every(({ value }) => value === DEFINE_VALUE);
  const fallback = foundNothing ? toWebSearchItem(query) : undefined;
  if (fallback === undefined) {
    return [...answers.map(toAnswerOption), ...results];
  }
  const firstRows = answers.length === 0 ? [NO_MATCHES_OPTION] : answers.map(toAnswerOption);
  return [...firstRows, toAnswerOption(fallback)];
};

const getActionSearchIcon = (query: string): string | undefined =>
  [
    calculate(query),
    parseConversion(query),
    toUnitItem(query),
    toTimeZoneItem(query),
    toDateItem(query),
    toTimerItem(query),
    toAliasSearchItem(query),
    toDictionaryItem(query),
  ].some((answer) => answer !== undefined)
    ? ACTIVE_SEARCH_ICON
    : undefined;

/** Search keeps this order between equal matches, so what's first wins a tie. */
export const orderSearchItems = (
  fixedItems: readonly LauncherItem[],
  redhotItems: readonly LauncherItem[],
  appItems: readonly LauncherItem[],
): LauncherItem[] => [
  ...fixedItems,
  ...redhotItems.filter(({ ranksAfterApps }) => ranksAfterApps !== true),
  ...appItems,
  ...redhotItems.filter(({ ranksAfterApps }) => ranksAfterApps === true),
];

// A link that fails to open shouldn't take the search window down with it.
const showErrorsAsNotice = async (run: () => Promise<string>): Promise<string> => {
  try {
    return await run();
  } catch (error) {
    writeLog("item.notice-error", { error }, { level: "warn" });
    return styleText("red", error instanceof Error ? error.message : String(error));
  }
};

const trackItem = async (
  session: Session,
  value: string,
  run: () => Promise<string>,
  interactive = false,
): Promise<string> => {
  session.runningItem = value;
  try {
    return await withAction("item.run", { item: value, interactive }, run);
  } finally {
    session.runningItem = undefined;
  }
};

const openSettingsFor = async (items: readonly LauncherItem[], value?: string): Promise<string> => {
  const item = items.find((candidate) => candidate.value === value);
  if (item === undefined) {
    return NO_NOTICE;
  }
  return showErrorsAsNotice(() => runItemSettings(item.value, item.name));
};

const pickItemForSettings = async (getItems: GetItems, title: string): Promise<string> => {
  drawScreen({ title });
  const { value } = await promptForSelection(() => toOptions(getItems()), PICK_ITEM_PLACEHOLDER, {
    replaceable: true,
  });
  return openSettingsFor(getItems(), value);
};

// Esc here also backs out of the question, so it can't end Redhot by being pressed twice.
const confirmEndProgram = async (): Promise<boolean> => {
  const choice = await select({
    message: "End Redhot?",
    options: [
      { value: END_PROGRAM_CHOICE, label: "End program" },
      { value: CANCEL_CHOICE, label: "Cancel" },
    ],
  });
  return choice === END_PROGRAM_CHOICE;
};

const opensOwnScreen = (query: string): boolean =>
  toFileSearchQuery(query) !== undefined || toPort(query) !== undefined;

/** Shows the search bar once. */
const runSearchRound = async (
  notice: string,
  session: Session,
  keptSearch?: KeptSearch,
): Promise<RoundResult> => {
  drawScreen({ notice });
  const [menuBarRunning, apps] = await Promise.all([isMenuBarRunning(), listApps()]);
  const fixedItems = buildCommandItems(menuBarRunning);
  const appItems = apps.map(toAppItem);
  const getItems: GetItems = () => orderSearchItems(fixedItems, listRedhotItems(), appItems);

  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => toOptions(getItems()),
    SEARCH_PLACEHOLDER,
    {
      rank: rankWithAnswers,
      replaceable: true,
      getSearchIcon: getActionSearchIcon,
      onQueryChange: createQueryExit(closeReplaceableList, opensOwnScreen),
      initialQuery: keptSearch?.query ?? "",
      initialFocus: keptSearch?.focusedValue,
    },
  );
  if (session.nextItem !== undefined) {
    return { keepRunning: true, notice: NO_NOTICE };
  }
  const fileQuery = toFileSearchQuery(query);
  if (cancelled && fileQuery !== undefined) {
    const searchFiles = (): Promise<string> => runFileSearch(fileQuery);
    return {
      keepRunning: true,
      notice: await showErrorsAsNotice(() =>
        trackItem(session, FILE_SEARCH_VALUE, searchFiles, true),
      ),
    };
  }
  if (cancelled && toPort(query) !== undefined) {
    const searchPort = (): Promise<string> => runPortScreen(query);
    return {
      keepRunning: true,
      notice: await showErrorsAsNotice(() =>
        trackItem(session, PORTS_SEARCH_VALUE, searchPort, true),
      ),
    };
  }
  // Esc on a kept search clears it. Asking to end Redhot would be a surprise here.
  if (cancelled && keptSearch !== undefined) {
    return { keepRunning: true, notice: NO_NOTICE };
  }
  if (cancelled) {
    return (await confirmEndProgram()) ? endProgram() : { keepRunning: true, notice: NO_NOTICE };
  }
  // An answer has no settings to open, so Tab copies it like Enter does. It came from what was
  // typed, so that stays on screen to change and run again.
  const answer = [...toAnswerItems(query), toWebSearchItem(query)].find(
    (item) => item?.value === value,
  );
  if (answer !== undefined) {
    return {
      keepRunning: true,
      notice: await showErrorsAsNotice(() => trackItem(session, answer.value, answer.run)),
      keptSearch: { query, focusedValue: answer.value },
    };
  }
  if (value === EXIT_VALUE && !wantsSettings) {
    return endProgram();
  }
  if (wantsSettings) {
    return {
      keepRunning: true,
      notice: await openSettingsFor(getItems(), value),
    };
  }
  if (value === SET_ALIAS_VALUE || value === CREATE_HOTKEY_VALUE) {
    const title = value === SET_ALIAS_VALUE ? "Add Alias" : "Create Hotkey";
    return {
      keepRunning: true,
      notice: await pickItemForSettings(getItems, title),
    };
  }
  const item = getItems().find((candidate) => candidate.value === value);
  const nextNotice =
    item === undefined
      ? NO_NOTICE
      : await showErrorsAsNotice(() => trackItem(session, item.value, item.run, item.needsWindow));
  return { keepRunning: true, notice: nextNotice };
};

const runItemByValue = async (value: string, closesWhenDone: boolean): Promise<string> => {
  const item = findRedhotItem(value);
  if (item === undefined) {
    throw new Error(`Unknown item "${value}".`);
  }
  return item.run({ closesWhenDone });
};

/** Runs the item a hotkey asked for. A window that closes with it shows errors as it exits. */
const runNextItem = async (value: string, session: Session): Promise<RoundResult> => {
  session.nextItem = undefined;
  const run = (): Promise<string> => runItemByValue(value, session.closeWhenDone);
  const item = findRedhotItem(value);
  const tracked = (): Promise<string> => trackItem(session, value, run, item?.needsWindow);
  const notice = session.closeWhenDone ? await tracked() : await showErrorsAsNotice(tracked);
  const keepRunning = !session.closeWhenDone || session.nextItem !== undefined;
  return keepRunning ? { keepRunning, notice } : endProgram();
};

// Anything but a list could hold unsaved typing, so there the window only comes to the front.
const switchToItem = (value: string, session: Session): void => {
  if (value !== session.runningItem && closeReplaceableList()) {
    session.nextItem = value;
  }
};

// The shortcut means search, and a window opened for one item isn't showing it. A kept search is
// left alone, so coming back from the browser finds it where it was.
const switchToSearch = (session: Session): void => {
  if (session.closeWhenDone && closeReplaceableList()) {
    session.closeWhenDone = false;
  }
};

/**
 * Stays open after each action so the shortcut can bring this same window back. A hotkey's window
 * passes the item it was opened for, and closes when that's done.
 */
/** An extra window leaves the socket to the main one, so hotkeys keep reaching that window. */
export const runLauncher = async (
  firstItem?: string,
  { isExtraWindow = false }: { isExtraWindow?: boolean } = {},
): Promise<void> => {
  void refreshRatesIfStale();
  void import("../sync/sync.ts").then(({ syncNow }) => syncNow()).catch(() => {});
  const session: Session = {
    runningItem: undefined,
    nextItem: firstItem,
    closeWhenDone: firstItem !== undefined,
  };
  const stopListening = isExtraWindow
    ? () => {}
    : await listenForRequests({
        onFocus: () => {
          switchToSearch(session);
        },
        onRunItem: (value) => {
          switchToItem(value, session);
        },
        onQuit: showEndingScreen,
      });
  try {
    let round: RoundResult = { keepRunning: true, notice: NO_NOTICE };
    while (round.keepRunning) {
      round =
        session.nextItem === undefined
          ? await runSearchRound(round.notice, session, round.keptSearch)
          : await runNextItem(session.nextItem, session);
    }
  } finally {
    stopListening();
  }
};
