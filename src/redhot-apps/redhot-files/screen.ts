import { styleText } from "node:util";
import { autocomplete, isCancel, select } from "@clack/prompts";
import { listApps } from "../../launcher/apps.ts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { ExtraKey, LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { copyText, runCommand } from "../../shell.ts";
import { toFileRow, toSafeName } from "./format.ts";
import type { FileResult, FileSearch } from "./search.ts";

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

type FileAction = typeof OPEN | typeof REVEAL | typeof COPY_PATH | typeof OPEN_WITH;

const OPEN_OPTION: { value: FileAction; label: string } = { value: OPEN, label: "Open" };
const PATH_OPTIONS: { value: FileAction; label: string }[] = [
  { value: REVEAL, label: "Reveal in Finder" },
  { value: COPY_PATH, label: "Copy Path" },
  { value: OPEN_WITH, label: "Open With…" },
];

/** What differs between the commands that search the disk by name. */
export interface SearchScreen {
  name: string;
  icon: string;
  placeholder: string;
  noResultsText: string;
  cantOpenText: string;
  createSearch: () => FileSearch;
  /** Lists results before anything is typed. */
  listWhenEmpty?: boolean;
  /** False for a result that can only be opened, because it has no real location. */
  hasRealPath?: (path: string) => boolean;
}

const runOpen = async (args: readonly string[], { cantOpenText }: SearchScreen): Promise<void> => {
  try {
    await runCommand("open", args);
  } catch {
    // open's own message is a command line. The usual cause is something moved since it was indexed.
    throw new Error(cantOpenText);
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
const runFileAction = async (
  action: FileAction,
  path: string,
  screen: SearchScreen,
): Promise<string | undefined> => {
  if (action === OPEN) {
    await runOpen([path], screen);
    return "";
  }
  if (action === REVEAL) {
    await runOpen(["-R", path], screen);
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
  await runOpen(["-a", app, path], screen);
  return "";
};

const toScreenTitle = ({ name, icon }: SearchScreen): { title: string; icon: string } => ({
  title: name,
  icon,
});

const hasRealPath = (screen: SearchScreen, path: string): boolean =>
  screen.hasRealPath?.(path) ?? true;

const askForAction = async (
  { name, path }: FileResult,
  screen: SearchScreen,
): Promise<FileAction | undefined> => {
  drawScreen(toScreenTitle(screen));
  const choice = await select<FileAction>({
    message: toSafeName(name),
    options: hasRealPath(screen, path) ? [OPEN_OPTION, ...PATH_OPTIONS] : [OPEN_OPTION],
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

interface Session {
  screen: SearchScreen;
  search: FileSearch;
  closesWhenDone: boolean;
}

/** The list stays up after an action, unless the window is about to close with it. */
const runActionRound = async (
  action: FileAction,
  path: string,
  query: string,
  { screen, closesWhenDone }: Session,
): Promise<Round> => {
  const backToList = (notice: string): Round => ({
    isFinished: false,
    notice,
    query,
    focusedPath: path,
  });
  try {
    const notice = await runFileAction(action, path, screen);
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
  session: Session,
  { query: initialQuery, notice, focusedPath: initialFocus }: ListState,
): Promise<Round> => {
  const { screen, search } = session;
  drawScreen({ ...toScreenTitle(screen), notice });
  const labelWidth = (process.stdout.columns ?? FALLBACK_COLUMNS) - ROW_MARGIN;
  // The prompt clears its focus as it closes, so a key has to note the path when it's pressed.
  let focusedPath: string | undefined;
  let pressedKey: PressedKey | undefined;
  const keyPressed = new AbortController();
  const toActionKey = (key: string, hint: string, label: string, action: FileAction): ExtraKey => ({
    keys: [key],
    hint,
    getLabel: (path) => (path === undefined || !hasRealPath(screen, path) ? undefined : label),
    run: () => {
      pressedKey = { action, path: focusedPath };
      keyPressed.abort();
    },
  });

  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => search.getResults().map((file) => toOption(file, labelWidth)),
    screen.placeholder,
    {
      listWhenEmpty: screen.listWhenEmpty ?? false,
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
      getEmptyText: () => (search.isSearching() ? "Searching…" : screen.noResultsText),
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
    return runActionRound(pressedKey.action, pressedKey.path, query, session);
  }
  if (cancelled) {
    return { isFinished: true, notice: "", query, focusedPath: undefined };
  }
  // Enter with nothing listed has nothing to open, so the search carries on.
  const file = search.getResults().find(({ path }) => path === value);
  if (file === undefined) {
    return { isFinished: false, notice: "", query, focusedPath: undefined };
  }
  const action = wantsSettings ? await askForAction(file, screen) : OPEN;
  if (action === undefined) {
    return { isFinished: false, notice: "", query, focusedPath: file.path };
  }
  return runActionRound(action, file.path, query, session);
};

/** Runs a search screen until it's left, starting from this text. */
export const runSearchScreen = async (
  screen: SearchScreen,
  initialQuery = "",
  closesWhenDone = false,
): Promise<string> => {
  const search = screen.createSearch();
  search.setQuery(initialQuery);
  const session = { screen, search, closesWhenDone };
  try {
    let round = await runSearchRound(session, {
      query: initialQuery,
      notice: "",
      focusedPath: undefined,
    });
    while (!round.isFinished) {
      round = await runSearchRound(session, round);
    }
    return round.notice;
  } finally {
    search.stop();
  }
};
