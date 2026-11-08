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
