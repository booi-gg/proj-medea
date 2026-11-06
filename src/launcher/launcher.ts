import { styleText } from "node:util";
import { select } from "@clack/prompts";
import { readConfigSync } from "../config.ts";
import { start, stop } from "../menubar/commands.ts";
import { toMedeaIcon } from "../medea-apps/icon.ts";
import { toCalculationItem } from "../medea-apps/medea-calculator/index.ts";
import { calculate } from "../medea-apps/medea-calculator/calculate.ts";
import { parseConversion } from "../medea-apps/medea-currency/convert.ts";
import { toConversionItems } from "../medea-apps/medea-currency/index.ts";
import { refreshRatesIfStale } from "../medea-apps/medea-currency/rates.ts";
import { findMedeaItem, listMedeaItems } from "../medea-apps/registry.ts";
import type { LauncherItem } from "../medea-apps/types.ts";
import { isMenuBarRunning } from "../menubar/helper.ts";
import { withAction, writeLog } from "../log.ts";
import { listenForRequests } from "../terminals/running-cli.ts";
import { listApps, openApp } from "./apps.ts";
import type { App } from "./apps.ts";
import { formatHotkey } from "./hotkeys.ts";
import { ADD_ALIAS_LABEL, CREATE_HOTKEY_LABEL, runItemSettings } from "./item-settings.ts";
import { closeReplaceableList, promptForSelection } from "./prompt.ts";
import type { LauncherOption } from "./prompt.ts";
import { drawScreen } from "./screen.ts";
import { rankItems } from "./search.ts";

const TITLE_COLUMN_WIDTH = 40;
const EXIT_VALUE = "command:exit";
// Saved aliases and hotkeys use this value, so it stays when the command's name changes.
const SET_ALIAS_VALUE = "command:set-alias";
const CREATE_HOTKEY_VALUE = "command:create-hotkey";
const END_PROGRAM_CHOICE = "end-program";
const CANCEL_CHOICE = "cancel";
const SEARCH_PLACEHOLDER = "Cast actions";
const PICK_ITEM_PLACEHOLDER = "Choose an app or command";
const APP_ICON = styleText("cyan", "◆");
const COMMAND_ICON = toMedeaIcon("⌘");
const ACTIVE_SEARCH_ICON = toMedeaIcon("❯");

type GetItems = () => LauncherItem[];

interface RoundResult {
  keepRunning: boolean;
  notice: string;
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

// Answers come from the query, so they go above ordinary search results.
const rankWithAnswers = (query: string, options: readonly LauncherOption[]): LauncherOption[] => {
  const results = rankItems(query, options);
  const calculation = toCalculationItem(query);
  const answers = [
    ...(calculation === undefined ? [] : [calculation]),
    ...toConversionItems(query),
  ];
  return [
    ...answers.map((item) => ({ ...item, aliases: [], label: formatRow(item, [], "") })),
    ...results,
  ];
};

const getActionSearchIcon = (query: string): string | undefined =>
  calculate(query) !== undefined || parseConversion(query) !== undefined
    ? ACTIVE_SEARCH_ICON
    : undefined;

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
  return showErrorsAsNotice(withoutNotice(() => runItemSettings(item.value, item.name)));
};

const pickItemForSettings = async (getItems: GetItems, title: string): Promise<string> => {
  drawScreen({ title });
  const { value } = await promptForSelection(() => toOptions(getItems()), PICK_ITEM_PLACEHOLDER, {
    replaceable: true,
  });
  return openSettingsFor(getItems(), value);
};

// Esc here also backs out of the question, so it can't end Medea by being pressed twice.
const confirmEndProgram = async (): Promise<boolean> => {
  const choice = await select({
    message: "End Medea?",
    options: [
      { value: END_PROGRAM_CHOICE, label: "End program" },
      { value: CANCEL_CHOICE, label: "Cancel" },
    ],
  });
  return choice === END_PROGRAM_CHOICE;
};

/** Shows the search bar once. */
const runSearchRound = async (notice: string, session: Session): Promise<RoundResult> => {
  drawScreen({ notice });
  const [menuBarRunning, apps] = await Promise.all([isMenuBarRunning(), listApps()]);
  const fixedItems = buildCommandItems(menuBarRunning);
  const appItems = apps.map(toAppItem);
  const getItems: GetItems = () => [...fixedItems, ...listMedeaItems(), ...appItems];

  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => toOptions(getItems()),
    SEARCH_PLACEHOLDER,
    { rank: rankWithAnswers, replaceable: true, getSearchIcon: getActionSearchIcon },
  );
  if (session.nextItem !== undefined) {
    return { keepRunning: true, notice: NO_NOTICE };
  }
  if (cancelled) {
    return { keepRunning: !(await confirmEndProgram()), notice: NO_NOTICE };
  }
  // An answer has no settings to open, so Tab copies it like Enter does.
  const answer = [toCalculationItem(query), ...toConversionItems(query)].find(
    (item) => item?.value === value,
  );
  if (answer !== undefined) {
    return {
      keepRunning: true,
      notice: await showErrorsAsNotice(() => trackItem(session, answer.value, answer.run)),
    };
  }
  if (value === EXIT_VALUE && !wantsSettings) {
    return { keepRunning: false, notice: NO_NOTICE };
  }
  if (wantsSettings) {
    return { keepRunning: true, notice: await openSettingsFor(getItems(), value) };
  }
  if (value === SET_ALIAS_VALUE || value === CREATE_HOTKEY_VALUE) {
    const title = value === SET_ALIAS_VALUE ? "Add Alias" : "Create Hotkey";
    return { keepRunning: true, notice: await pickItemForSettings(getItems, title) };
  }
  const item = getItems().find((candidate) => candidate.value === value);
  const nextNotice =
    item === undefined
      ? NO_NOTICE
      : await showErrorsAsNotice(() => trackItem(session, item.value, item.run, item.needsWindow));
  return { keepRunning: true, notice: nextNotice };
};

const runItemByValue = async (value: string): Promise<string> => {
  const item = findMedeaItem(value);
  if (item === undefined) {
    throw new Error(`Unknown item "${value}".`);
  }
  return item.run();
};

/** Runs the item a hotkey asked for. A window that closes with it shows errors as it exits. */
const runNextItem = async (value: string, session: Session): Promise<RoundResult> => {
  session.nextItem = undefined;
  const run = (): Promise<string> => runItemByValue(value);
  const item = findMedeaItem(value);
  const tracked = (): Promise<string> => trackItem(session, value, run, item?.needsWindow);
  const notice = session.closeWhenDone ? await tracked() : await showErrorsAsNotice(tracked);
  return { keepRunning: !session.closeWhenDone || session.nextItem !== undefined, notice };
};

// Anything but a list could hold unsaved typing, so there the window only comes to the front.
const switchToItem = (value: string, session: Session): void => {
  if (value !== session.runningItem && closeReplaceableList()) {
    session.nextItem = value;
  }
};

// The shortcut means search, and a window opened for one item isn't showing it.
const switchToSearch = (session: Session): void => {
  if (session.closeWhenDone && closeReplaceableList()) {
    session.closeWhenDone = false;
  }
};

/**
 * Stays open after each action so the shortcut can bring this same window back. A hotkey's window
 * passes the item it was opened for, and closes when that's done.
 */
export const runLauncher = async (firstItem?: string): Promise<void> => {
  void refreshRatesIfStale();
  const session: Session = {
    runningItem: undefined,
    nextItem: firstItem,
    closeWhenDone: firstItem !== undefined,
  };
  const stopListening = await listenForRequests({
    onFocus: () => {
      switchToSearch(session);
    },
    onRunItem: (value) => {
      switchToItem(value, session);
    },
  });
  try {
    let round: RoundResult = { keepRunning: true, notice: NO_NOTICE };
    while (round.keepRunning) {
      round =
        session.nextItem === undefined
          ? await runSearchRound(round.notice, session)
          : await runNextItem(session.nextItem, session);
    }
  } finally {
    stopListening();
  }
};
