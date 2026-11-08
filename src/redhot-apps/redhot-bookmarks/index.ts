import { homedir } from "node:os";
import { join } from "node:path";
import { styleText } from "node:util";
import { readConfigSync } from "../../config.ts";
import { fitToColumns } from "../../launcher/screen.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { findInstalledApp } from "../redhot-projects/index.ts";
import { openTarget } from "../redhot-quicklinks/open-link.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { listBrowserBookmarks } from "./sources.ts";
import type { Bookmark } from "./sources.ts";

const APP_ID = "redhot-bookmarks";
const ICON = styleText("white", "☆");
// Every row is rebuilt on each keystroke, so a huge collection mustn't slow typing.
const MAX_BOOKMARKS_PER_BROWSER = 2000;
// Read when search asks, on every keystroke, so a scan is only done this often.
const CACHE_MS = 30_000;
// Together these fit Redhot's 80-column window, because a row that wraps breaks the redraw.
const MAX_NAME_COLUMNS = 44;
const MAX_KIND_COLUMNS = 28;
const WWW_PREFIX = /^www\./u;

interface Browser {
  id: string;
  label: string;
  bundle: string;
  userDataFolder: readonly string[];
}

const BROWSERS: readonly Browser[] = [
  {
    id: "chrome",
    label: "Chrome",
    bundle: "Google Chrome.app",
    userDataFolder: ["Google", "Chrome"],
  },
  { id: "arc", label: "Arc", bundle: "Arc.app", userDataFolder: ["Arc", "User Data"] },
  {
    id: "brave",
    label: "Brave",
    bundle: "Brave Browser.app",
    userDataFolder: ["BraveSoftware", "Brave-Browser"],
  },
  {
    id: "edge",
    label: "Edge",
    bundle: "Microsoft Edge.app",
    userDataFolder: ["Microsoft Edge"],
  },
];

const toSiteName = (url: string): string => new URL(url).hostname.replace(WWW_PREFIX, "");

/** A bookmark can be saved with no title, and the site's name is better than a blank row. */
export const toBookmarkName = ({ title, url }: Bookmark): string =>
  fitToColumns(toSafeName(title).trim() || toSiteName(url), MAX_NAME_COLUMNS);

/** The site is shown because bookmarks in different places often share a title like "Home". */
export const toBookmarkKind = (label: string, url: string): string =>
  fitToColumns(`${label} · ${toSiteName(url)}`, MAX_KIND_COLUMNS);

const toItem = ({ id, label }: Browser, appPath: string, bookmark: Bookmark): LauncherItem => ({
  value: `${APP_ID}:${id}:${bookmark.url}`,
  name: toBookmarkName(bookmark),
  icon: ICON,
  kind: toBookmarkKind(label, bookmark.url),
  ranksAfterApps: true,
  run: async () => {
    await openTarget(bookmark.url, appPath);
    return "";
  },
});

const scanItems = (): LauncherItem[] =>
  BROWSERS.flatMap((browser) => {
    const appPath = findInstalledApp(browser.bundle);
    if (appPath === undefined) {
      return [];
    }
    const folder = join(homedir(), "Library", "Application Support", ...browser.userDataFolder);
    return listBrowserBookmarks(folder, MAX_BOOKMARKS_PER_BROWSER).map((bookmark) =>
      toItem(browser, appPath, bookmark),
    );
  });

let cached: { items: LauncherItem[]; scannedAt: number } | undefined;

const listItems = (): LauncherItem[] => {
  // Checked first, so with this off nothing on disk is read.
  if (readConfigSync().browserBookmarks !== true) {
    return [];
  }
  const now = Date.now();
  if (cached === undefined || now - cached.scannedAt > CACHE_MS) {
    cached = { items: scanItems(), scannedAt: now };
  }
  return cached.items;
};

export const browserBookmarks: RedhotApp = {
  id: APP_ID,
  listItems,
  listSettingsActions: () => [],
};
