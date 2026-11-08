import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { runSearchScreen } from "./screen.ts";
import type { SearchScreen } from "./screen.ts";
import { createFileSearch } from "./search.ts";

const APP_ID = "redhot-files";
const SEARCH_ID = "search";
const NAME = "Search Files";
const ICON = toRedhotIcon("⌕");
// Lowercase or not, so it still works with caps lock on.
const PREFIX = /^f /iu;

export const FILE_SEARCH_VALUE = `${APP_ID}:${SEARCH_ID}`;

const SCREEN: SearchScreen = {
  name: NAME,
  icon: ICON,
  placeholder: "Search files by name",
  noResultsText: "No files found",
  cantOpenText: "That file can't be opened. It may have moved or been deleted",
  createSearch: () => createFileSearch(),
};

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

/** Opens the search screen, starting from this text when the launcher's prefix brought us here. */
export const runFileSearch = (initialQuery = "", closesWhenDone = false): Promise<string> =>
  runSearchScreen(SCREEN, initialQuery, closesWhenDone);

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
