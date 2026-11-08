import { basename } from "node:path";
import { runSearchScreen } from "../redhot-files/screen.ts";
import type { SearchScreen } from "../redhot-files/screen.ts";
import {
  createFileSearch,
  isSearchablePath,
  isSkippedFolder,
  toSpotlightQuery,
} from "../redhot-files/search.ts";
import type { FileSearch } from "../redhot-files/search.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { hasRealPath, toPlaces } from "./places.ts";

const APP_ID = "redhot-folders";
const SEARCH_ID = "search";
const NAME = "Search Folders";
const ICON = toRedhotIcon("⌂");
// App bundles have their own content type, so this leaves them out too.
const FOLDERS_ONLY = 'kMDItemContentType == "public.folder"';

export const toFolderQuery = (query: string): string | undefined => {
  const nameQuery = toSpotlightQuery(query);
  return nameQuery === undefined ? undefined : `${nameQuery} && ${FOLDERS_ONLY}`;
};

/** Unlike a file search, the result's own name counts, or every project's node_modules would list. */
export const isSearchableFolder = (path: string, home: string): boolean =>
  isSearchablePath(path, home) && !isSkippedFolder(basename(path));

const createFolderSearch = (): FileSearch =>
  createFileSearch({
    toQuery: toFolderQuery,
    isSearchable: isSearchableFolder,
    pinned: toPlaces(),
  });

const SCREEN: SearchScreen = {
  name: NAME,
  icon: ICON,
  placeholder: "Search folders, or pick a place",
  noResultsText: "No folders found",
  cantOpenText: "That folder can't be opened. It may have moved or been deleted",
  createSearch: createFolderSearch,
  listWhenEmpty: true,
  hasRealPath,
};

const searchItem: LauncherItem = {
  value: `${APP_ID}:${SEARCH_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  hint: "Open a folder, or a place like Downloads or Recents",
  needsWindow: true,
  run: (context) => runSearchScreen(SCREEN, "", context?.closesWhenDone),
};

export const folders: RedhotApp = {
  id: APP_ID,
  listItems: () => [searchItem],
  listSettingsActions: () => [],
};
