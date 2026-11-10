import { styleText } from "node:util";
import { confirm, isCancel, select, spinner } from "@clack/prompts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { ExtraKey, LauncherOption } from "../../launcher/prompt.ts";
import { rankItems } from "../../launcher/search.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { toRedhotIcon } from "../icon.ts";
import { toPortRow, toRunningRow } from "./format.ts";
import { listPortListeners, listRunningItems, needsAdmin, toPort } from "./list.ts";
import type { RunningItem } from "./list.ts";
import { listListenersOnPort, listPortsInUse } from "./ports.ts";
import type { PortListener } from "./ports.ts";
import { createProcessSearch } from "./search.ts";
import type { ProcessSearch } from "./search.ts";
import {
  FORCE_QUIT,
  QUIT,
  needsConfirmation,
  stopRunningItem,
  toConfirmationMessage,
} from "./stop.ts";
import type { StopMode } from "./stop.ts";

export const SCREEN_NAME = "Kill Processes";
export const SCREEN_ICON = toRedhotIcon("✕");
export const PORTS_SCREEN_NAME = "Kill Ports";
export const PORTS_SCREEN_ICON = toRedhotIcon("⇄");
const FALLBACK_COLUMNS = 80;
// Room for the focus marker and the margins.
const ROW_MARGIN = 8;
const CTRL_K = "\u000B";
const LOOKING_UP = "Looking…";
const ALL_DIGITS = /^\d+$/u;

// A port's listeners all match it, so name ranking would only throw them away.
const rankRunning = (query: string, options: readonly LauncherOption[]): LauncherOption[] =>
  toPort(query) === undefined ? rankItems(query, options) : [...options];

/** Loose matching would list port 51479 for 5179, and Enter would then stop the wrong server. */
export const rankPorts = (query: string, options: readonly LauncherOption[]): LauncherOption[] => {
  const text = query.trim();
  return ALL_DIGITS.test(text)
    ? options.filter(({ aliases }) => aliases?.some((port) => port.startsWith(text)))
    : rankRunning(query, options);
};

/** Only the start of a process ID or name counts, so Enter can't stop a near match. */
export const rankProcesses = (
  query: string,
  options: readonly LauncherOption[],
): LauncherOption[] => {
  const digits = query.trim();
  return ALL_DIGITS.test(digits)
    ? options.filter(
        ({ name, aliases }) =>
          name.startsWith(digits) || aliases?.some((pid) => pid.startsWith(digits)),
      )
    : rankRunning(query, options);
};

/** What differs between the list of processes and the list of ports. */
interface ListView<Item extends RunningItem> {
  rank: (query: string, options: readonly LauncherOption[]) => LauncherOption[];
  title: { title: string; icon: string };
  placeholder: string;
  nothingMatchesText: string;
  enterLabel: string;
  createSearch: () => ProcessSearch<Item>;
  toOption: (item: Item, labelWidth: number) => LauncherOption;
}

const PROCESS_VIEW: ListView<RunningItem> = {
  title: { title: SCREEN_NAME, icon: SCREEN_ICON },
  placeholder: "Search running apps and processes",
  nothingMatchesText: "No running apps or processes match",
  enterLabel: "quit",
  rank: rankProcesses,
  createSearch: () =>
    createProcessSearch({ loadAll: listRunningItems, loadPort: listPortListeners }),
  toOption: (item, labelWidth) => ({
    value: String(item.pid),
    name: item.name,
    aliases: [String(item.pid)],
    label: toRunningRow(item, labelWidth),
  }),
};

const PORTS_VIEW: ListView<PortListener> = {
  title: { title: PORTS_SCREEN_NAME, icon: PORTS_SCREEN_ICON },
  placeholder: "Search by port or project, then pick one to kill",
  nothingMatchesText: "Nothing of yours is listening on a matching port",
  enterLabel: "kill",
  rank: rankPorts,
  createSearch: () =>
    createProcessSearch({ loadAll: listPortsInUse, loadPort: listListenersOnPort }),
  toOption: (listener, labelWidth) => ({
    value: String(listener.pid),
    name: listener.name,
    aliases: listener.ports.map(String),
    label: toPortRow(listener, labelWidth),
  }),
};

const toEmptyText = <Item extends RunningItem>(
  search: ProcessSearch<Item>,
  nothingMatchesText: string,
): string => {
  if (search.isSearching()) {
    return LOOKING_UP;
  }
  const port = search.getPort();
  return port === undefined
    ? nothingMatchesText
    : `Nothing of yours is listening on port ${port}. Root's listeners can't be seen without sudo`;
};

const askForMode = async (
  item: RunningItem,
  title: ListView<RunningItem>["title"],
): Promise<StopMode | undefined> => {
  drawScreen(title);
  const choice = await select<StopMode>({
    message: toSafeName(item.name),
    options: [
      { value: QUIT, label: "Quit" },
      { value: FORCE_QUIT, label: "Force Quit" },
    ],
  });
  return isCancel(choice) ? undefined : choice;
};

const isConfirmed = async (
  item: RunningItem,
  mode: StopMode,
  title: ListView<RunningItem>["title"],
): Promise<boolean> => {
  if (!needsConfirmation(item, mode)) {
    return true;
  }
  drawScreen(title);
  const answer = await confirm({
    message: toConfirmationMessage(item, mode),
    initialValue: false,
  });
  return answer === true;
};

/** What the list shows when it opens. */
interface ListState {
  query: string;
  notice: string;
  focusedValue: string | undefined;
}

interface Round extends ListState {
  /** False to show the list again with this state. */
  isFinished: boolean;
}

interface Session<Item extends RunningItem> {
  view: ListView<Item>;
  search: ProcessSearch<Item>;
  closesWhenDone: boolean;
}

const withLoader = async <Result>(
  message: string,
  task: () => Promise<Result>,
): Promise<Result> => {
  const progress = spinner();
  progress.start(message);
  try {
    return await task();
  } finally {
    progress.clear();
  }
};

/** The row to land on once this one is gone, so stopping several in a row doesn't jump to the top. */
const toFocusAfterStop = <Item extends RunningItem>(
  item: Item,
  results: readonly Item[],
): string => {
  const index = results.indexOf(item);
  return String((results[index + 1] ?? results[index - 1] ?? item).pid);
};

/** The list stays up after stopping something, unless the window is about to close with it. */
const runStopRound = async <Item extends RunningItem>(
  item: Item,
  mode: StopMode,
  query: string,
  { view, search, closesWhenDone }: Session<Item>,
): Promise<Round> => {
  const backToList = (notice: string, focusedValue = String(item.pid)): Round => ({
    isFinished: false,
    notice,
    query,
    focusedValue,
  });
  if (!(await isConfirmed(item, mode, view.title))) {
    return backToList("");
  }
  try {
    const nextFocus = toFocusAfterStop(item, search.getResults());
    const stop = (): Promise<string> => stopRunningItem(item, mode);
    drawScreen(view.title);
    // sudo asks for a password in this terminal, and a loader would draw over it.
    const outcome = needsAdmin(item)
      ? await stop()
      : await withLoader(`Stopping ${toSafeName(item.name)}`, stop);
    return { ...backToList(outcome, nextFocus), isFinished: closesWhenDone };
  } catch (error) {
    // A window that's closing shows this as it exits. Otherwise it goes above the results.
    if (closesWhenDone) {
      throw error;
    }
    return backToList(styleText("red", error instanceof Error ? error.message : String(error)));
  }
};

/** Shows the list once, read fresh so what was just stopped is gone from it. */
const runListRound = async <Item extends RunningItem>(
  session: Session<Item>,
  { query: initialQuery, notice, focusedValue: initialFocus }: ListState,
): Promise<Round> => {
  const { view, search } = session;
  drawScreen({ ...view.title, notice });
  await withLoader("Loading", () => search.reload(initialQuery));
  const labelWidth = (process.stdout.columns ?? FALLBACK_COLUMNS) - ROW_MARGIN;
  // The prompt clears its focus as it closes, so the key has to note the result when it's pressed.
  let focusedValue: string | undefined;
  let forceQuitValue: string | undefined;
  const keyPressed = new AbortController();
  const forceQuitKey: ExtraKey = {
    keys: [CTRL_K],
    hint: "^K",
    getLabel: (value) => (value === undefined ? undefined : "force quit"),
    run: () => {
      forceQuitValue = focusedValue;
      keyPressed.abort();
    },
  };
  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => search.getResults().map((item) => view.toOption(item, labelWidth)),
    view.placeholder,
    {
      listWhenEmpty: true,
      rank: view.rank,
      initialQuery,
      initialFocus,
      replaceable: true,
      enterLabel: view.enterLabel,
      settingsLabel: "actions",
      signal: keyPressed.signal,
      onFocus: (focused) => {
        focusedValue = focused;
      },
      onQueryChange: search.setQuery,
      getEmptyText: () => toEmptyText(search, view.nothingMatchesText),
      watchOptions: (refresh) => {
        search.setOnChange(refresh);
        return () => {
          search.setOnChange(undefined);
        };
      },
      extraKeys: [forceQuitKey],
    },
  );
  const findItem = (wanted: string | undefined): Item | undefined =>
    search.getResults().find(({ pid }) => String(pid) === wanted);
  const forceQuitItem = findItem(forceQuitValue);
  if (forceQuitItem !== undefined) {
    return runStopRound(forceQuitItem, FORCE_QUIT, query, session);
  }
  if (cancelled) {
    return { isFinished: true, notice: "", query, focusedValue: undefined };
  }
  // Enter with nothing listed has nothing to stop, so the search carries on.
  const item = findItem(value);
  if (item === undefined) {
    return { isFinished: false, notice: "", query, focusedValue: undefined };
  }
  const mode = wantsSettings ? await askForMode(item, view.title) : QUIT;
  if (mode === undefined) {
    return { isFinished: false, notice: "", query, focusedValue: value };
  }
  return runStopRound(item, mode, query, session);
};

/** Runs a list until it's left, starting from this text. */
const runScreen = async <Item extends RunningItem>(
  view: ListView<Item>,
  initialQuery: string,
  closesWhenDone: boolean,
): Promise<string> => {
  const search = view.createSearch();
  const session = { view, search, closesWhenDone };
  try {
    let round: Round = {
      isFinished: false,
      query: initialQuery,
      notice: "",
      focusedValue: undefined,
    };
    while (!round.isFinished) {
      round = await runListRound(session, round);
    }
    return round.notice;
  } finally {
    search.stop();
  }
};

export const runProcessScreen = (initialQuery = "", closesWhenDone = false): Promise<string> =>
  runScreen(PROCESS_VIEW, initialQuery, closesWhenDone);

export const runPortScreen = (initialQuery = "", closesWhenDone = false): Promise<string> =>
  runScreen(PORTS_VIEW, initialQuery, closesWhenDone);
