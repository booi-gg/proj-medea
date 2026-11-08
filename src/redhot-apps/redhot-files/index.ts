import { styleText } from "node:util";
import { autocomplete, isCancel, select } from "@clack/prompts";
import { listApps } from "../../launcher/apps.ts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { ExtraKey, LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { copyText, runCommand } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { toFileRow, toSafeName } from "./format.ts";
import { createFileSearch } from "./search.ts";
import type { FileResult, FileSearch } from "./search.ts";

const APP_ID = "redhot-files";
const SEARCH_ID = "search";
const NAME = "Search Files";
const ICON = toRedhotIcon("⌕");
const SCREEN_TITLE = { title: NAME, icon: ICON };
const PLACEHOLDER = "Search files by name";
// Lowercase or not, so it still works with caps lock on.
const PREFIX = /^f /iu;
const FALLBACK_COLUMNS = 80;
// Room for the focus marker and the margins.
const ROW_MARGIN = 8;
const MAX_VISIBLE_APPS = 6;
const CTRL_R = "\u0012";
const CTRL_P = "\u0010";
const OPEN = "open";
const REVEAL = "reveal";
const COPY_PATH = "copy-path";
const OPEN_WITH = "open-with";

export const FILE_SEARCH_VALUE = `${APP_ID}:${SEARCH_ID}`;

type FileAction = typeof OPEN | typeof REVEAL | typeof COPY_PATH | typeof OPEN_WITH;

/** The text to search for when the launcher's query asks for files, or undefined when it doesn't. */
export const toFileSearchQuery = (query: string): string | undefined =>
  PREFIX.test(query) ? query.replace(PREFIX, "") : undefined;

/**
 * Closes the launcher's list as soon as its text asks for files. It waits for the keypress to
 * finish, because this is called while clack is still handling it. Only once, because pasted text
 * changes the query many times in one go, and a second close would land on the file search list.
 */
export const createFileSearchExit = (close: () => void): ((query: string) => void) => {
  let isLeaving = false;
  return (query) => {
    if (!isLeaving && toFileSearchQuery(query) !== undefined) {
      isLeaving = true;
      setImmediate(close);
    }
  };
};

const runOpen = async (args: readonly string[]): Promise<void> => {
  try {
    await runCommand("open", args);
  } catch {
    // open's own message is a command line. The usual cause is a file moved since it was indexed.
    throw new Error("That file can't be opened. It may have moved or been deleted");
  }
};

const askForApp = async (): Promise<string | undefined> => {
  const apps = await listApps();
  const choice = await autocomplete({
    message: "Open with",
    maxItems: MAX_VISIBLE_APPS,
    options: apps.map(({ name, path }) => ({ value: path, label: name })),
  });
  return isCancel(choice) ? undefined : choice;
};

/** Returns a line to show when it's done, or undefined when it was cancelled. */
const runFileAction = async (action: FileAction, path: string): Promise<string | undefined> => {
  if (action === OPEN) {
    await runOpen([path]);
    return "";
  }
  if (action === REVEAL) {
    await runOpen(["-R", path]);
    return "";
  }
  if (action === COPY_PATH) {
    await copyText(path);
    return `Copied ${toSafeName(path)}`;
  }
  const app = await askForApp();
  if (app === undefined) {
    return undefined;
  }
  await runOpen(["-a", app, path]);
  return "";
};

const askForAction = async ({ name }: FileResult): Promise<FileAction | undefined> => {
  drawScreen(SCREEN_TITLE);
  const choice = await select<FileAction>({
    message: toSafeName(name),
    options: [
      { value: OPEN, label: "Open" },
      { value: REVEAL, label: "Reveal in Finder" },
      { value: COPY_PATH, label: "Copy Path" },
      { value: OPEN_WITH, label: "Open With…" },
    ],
  });
  return isCancel(choice) ? undefined : choice;
};

/** What the list shows when it opens. */
interface ListState {
  query: string;
  notice: string;
  focusedPath: string | undefined;
}

interface Round extends ListState {
  /** False to show the list again with this state. */
  isFinished: boolean;
}

/** The list stays up after an action, unless the window is about to close with it. */
const runActionRound = async (
  action: FileAction,
  path: string,
  query: string,
  closesWhenDone: boolean,
): Promise<Round> => {
  const backToList = (notice: string): Round => ({
    isFinished: false,
    notice,
    query,
    focusedPath: path,
  });
  try {
    const notice = await runFileAction(action, path);
    if (notice === undefined || !closesWhenDone) {
      return backToList(notice ?? "");
    }
    return { ...backToList(notice), isFinished: true };
  } catch (error) {
    // A window that's closing shows this as it exits. Otherwise it goes above the results.
    if (closesWhenDone) {
      throw error;
    }
    return backToList(styleText("red", error instanceof Error ? error.message : String(error)));
  }
};

interface PressedKey {
  action: FileAction;
  path: string | undefined;
}

const toOption = (file: FileResult, labelWidth: number): LauncherOption => ({
  value: file.path,
  name: file.name,
  aliases: [],
  label: toFileRow(file, labelWidth),
});

/** Shows the list once. */
const runSearchRound = async (
  search: FileSearch,
  { query: initialQuery, notice, focusedPath: initialFocus }: ListState,
  closesWhenDone: boolean,
): Promise<Round> => {
  drawScreen({ ...SCREEN_TITLE, notice });
  const labelWidth = (process.stdout.columns ?? FALLBACK_COLUMNS) - ROW_MARGIN;
  // The prompt clears its focus as it closes, so a key has to note the path when it's pressed.
  let focusedPath: string | undefined;
  let pressedKey: PressedKey | undefined;
  const keyPressed = new AbortController();
  const toActionKey = (key: string, hint: string, label: string, action: FileAction): ExtraKey => ({
    keys: [key],
    hint,
    getLabel: (path) => (path === undefined ? undefined : label),
    run: () => {
      pressedKey = { action, path: focusedPath };
      keyPressed.abort();
    },
  });

  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => search.getResults().map((file) => toOption(file, labelWidth)),
    PLACEHOLDER,
    {
      // Spotlight has already matched and the search has ranked, so the order stands.
      rank: (_query, options) => [...options],
      initialQuery,
      initialFocus,
      replaceable: true,
      enterLabel: OPEN,
      settingsLabel: "actions",
      signal: keyPressed.signal,
      onFocus: (path) => {
        focusedPath = path;
      },
      onQueryChange: search.setQuery,
      getEmptyText: () => (search.isSearching() ? "Searching…" : "No files found"),
      watchOptions: (refresh) => {
        search.setOnChange(refresh);
        return () => {
          search.setOnChange(undefined);
        };
      },
      extraKeys: [
        toActionKey(CTRL_R, "^R", "reveal", REVEAL),
        toActionKey(CTRL_P, "^P", "copy path", COPY_PATH),
      ],
    },
  );
  if (pressedKey?.path !== undefined) {
    return runActionRound(pressedKey.action, pressedKey.path, query, closesWhenDone);
  }
  if (cancelled) {
    return { isFinished: true, notice: "", query, focusedPath: undefined };
  }
  // Enter with nothing listed has nothing to open, so the search carries on.
  const file = search.getResults().find(({ path }) => path === value);
  if (file === undefined) {
    return { isFinished: false, notice: "", query, focusedPath: undefined };
  }
  const action = wantsSettings ? await askForAction(file) : OPEN;
  if (action === undefined) {
    return { isFinished: false, notice: "", query, focusedPath: file.path };
  }
  return runActionRound(action, file.path, query, closesWhenDone);
};

/** Opens the search screen, starting from this text when the launcher's prefix brought us here. */
export const runFileSearch = async (initialQuery = "", closesWhenDone = false): Promise<string> => {
  const search = createFileSearch();
  search.setQuery(initialQuery);
  try {
    const firstState = { query: initialQuery, notice: "", focusedPath: undefined };
    let round = await runSearchRound(search, firstState, closesWhenDone);
    while (!round.isFinished) {
      round = await runSearchRound(search, round, closesWhenDone);
    }
    return round.notice;
  } finally {
    search.stop();
  }
};

const searchItem: LauncherItem = {
  value: FILE_SEARCH_VALUE,
  name: NAME,
  icon: ICON,
  kind: "Command",
  hint: "Find files by name with Spotlight",
  needsWindow: true,
  run: (context) => runFileSearch("", context?.closesWhenDone),
};

export const files: RedhotApp = {
  id: APP_ID,
  listItems: () => [searchItem],
  listSettingsActions: () => [],
};
