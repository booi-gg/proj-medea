import { styleText } from "node:util";
import { confirm, isCancel, select } from "@clack/prompts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { ExtraKey, LauncherOption } from "../../launcher/prompt.ts";
import { rankItems } from "../../launcher/search.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { toRedhotIcon } from "../icon.ts";
import { toRunningRow } from "./format.ts";
import { toPort } from "./list.ts";
import type { RunningItem } from "./list.ts";
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

export const SCREEN_NAME = "Kill Process or Port";
export const SCREEN_ICON = toRedhotIcon("✕");
const TITLE = { title: SCREEN_NAME, icon: SCREEN_ICON };
const FALLBACK_COLUMNS = 80;
// Room for the focus marker and the margins.
const ROW_MARGIN = 8;
const CTRL_K = "\u000B";
const PLACEHOLDER = "Search running apps and processes, or type port 3000";
const NOTHING_MATCHES = "No running apps or processes match";
const LOOKING_UP = "Looking…";

const toEmptyText = (search: ProcessSearch): string => {
  if (search.isSearching()) {
    return LOOKING_UP;
  }
  const port = search.getPort();
  return port === undefined
    ? NOTHING_MATCHES
    : `Nothing of yours is listening on port ${port}. Root's listeners can't be seen without sudo`;
};

const toOption = (item: RunningItem, labelWidth: number): LauncherOption => ({
  value: String(item.pid),
  name: item.name,
  aliases: [String(item.pid)],
  label: toRunningRow(item, labelWidth),
});

// A port's listeners all match it, so name ranking would only throw them away.
const rankRunning = (query: string, options: readonly LauncherOption[]): LauncherOption[] =>
  toPort(query) === undefined ? rankItems(query, options) : [...options];

const askForMode = async (item: RunningItem): Promise<StopMode | undefined> => {
  drawScreen(TITLE);
  const choice = await select<StopMode>({
    message: toSafeName(item.name),
    options: [
      { value: QUIT, label: "Quit" },
      { value: FORCE_QUIT, label: "Force Quit" },
    ],
  });
  return isCancel(choice) ? undefined : choice;
};

const isConfirmed = async (item: RunningItem, mode: StopMode): Promise<boolean> => {
  if (!needsConfirmation(item, mode)) {
    return true;
  }
  drawScreen(TITLE);
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

interface Session {
  search: ProcessSearch;
  closesWhenDone: boolean;
}

/** The list stays up after stopping something, unless the window is about to close with it. */
const runStopRound = async (
  item: RunningItem,
  mode: StopMode,
  query: string,
  { closesWhenDone }: Session,
): Promise<Round> => {
  const backToList = (notice: string): Round => ({
    isFinished: false,
    notice,
    query,
    focusedValue: String(item.pid),
  });
  if (!(await isConfirmed(item, mode))) {
    return backToList("");
  }
  try {
    return { ...backToList(await stopRunningItem(item, mode)), isFinished: closesWhenDone };
  } catch (error) {
    // A window that's closing shows this as it exits. Otherwise it goes above the results.
    if (closesWhenDone) {
      throw error;
    }
    return backToList(styleText("red", error instanceof Error ? error.message : String(error)));
  }
};

/** Shows the list once, read fresh so what was just stopped is gone from it. */
const runListRound = async (
  session: Session,
  { query: initialQuery, notice, focusedValue: initialFocus }: ListState,
): Promise<Round> => {
  const { search } = session;
  drawScreen({ ...TITLE, notice });
  await search.reload(initialQuery);
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
    () => search.getResults().map((item) => toOption(item, labelWidth)),
    PLACEHOLDER,
    {
      listWhenEmpty: true,
      rank: rankRunning,
      initialQuery,
      initialFocus,
      replaceable: true,
      enterLabel: "quit",
      settingsLabel: "actions",
      signal: keyPressed.signal,
      onFocus: (focused) => {
        focusedValue = focused;
      },
      onQueryChange: search.setQuery,
      getEmptyText: () => toEmptyText(search),
      watchOptions: (refresh) => {
        search.setOnChange(refresh);
        return () => {
          search.setOnChange(undefined);
        };
      },
      extraKeys: [forceQuitKey],
    },
  );
  const findItem = (wanted: string | undefined): RunningItem | undefined =>
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
  const mode = wantsSettings ? await askForMode(item) : QUIT;
  if (mode === undefined) {
    return { isFinished: false, notice: "", query, focusedValue: value };
  }
  return runStopRound(item, mode, query, session);
};

/** Runs the screen until it's left, starting from this text. */
export const runProcessScreen = async (
  initialQuery = "",
  closesWhenDone = false,
): Promise<string> => {
  const search = createProcessSearch();
  const session = { search, closesWhenDone };
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
