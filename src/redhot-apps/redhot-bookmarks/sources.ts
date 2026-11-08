import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isObject } from "../../config.ts";

const BOOKMARKS_FILE = "Bookmarks";
// Leaves out "Guest Profile" and "System Profile", which aren't anyone's own bookmarks.
const PROFILE_FOLDER = /^(?:Default|Profile \d+)$/u;
// A bookmarklet would run code, and pages like chrome://settings can't be opened from outside.
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

export interface Bookmark {
  title: string;
  url: string;
}

const toWebUrl = (text: unknown): string | undefined => {
  if (typeof text !== "string" || !URL.canParse(text)) {
    return undefined;
  }
  const { href, protocol } = new URL(text);
  return WEB_PROTOCOLS.has(protocol) ? href : undefined;
};

const toBookmark = (node: Record<string, unknown>): Bookmark | undefined => {
  const url = node.type === "url" ? toWebUrl(node.url) : undefined;
  if (url === undefined) {
    return undefined;
  }
  return { title: typeof node.name === "string" ? node.name : "", url };
};

const collectBookmarks = (node: unknown, found: Bookmark[]): void => {
  if (!isObject(node)) {
    return;
  }
  const bookmark = toBookmark(node);
  if (bookmark !== undefined) {
    found.push(bookmark);
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectBookmarks(child, found);
    }
  }
};

/** Every bookmark in a Chromium Bookmarks file, in the order the browser lists them. */
export const parseBookmarksFile = (text: string): Bookmark[] => {
  try {
    const parsed: unknown = JSON.parse(text);
    const found: Bookmark[] = [];
    if (isObject(parsed) && isObject(parsed.roots)) {
      for (const root of Object.values(parsed.roots)) {
        collectBookmarks(root, found);
      }
    }
    return found;
  } catch {
    return [];
  }
};

const listProfileFolders = (userDataFolder: string): string[] => {
  try {
    return readdirSync(userDataFolder)
      .filter((name) => PROFILE_FOLDER.test(name))
      .toSorted();
  } catch {
    return [];
  }
};

const readBookmarksFile = (profileFolder: string): Bookmark[] => {
  try {
    return parseBookmarksFile(readFileSync(join(profileFolder, BOOKMARKS_FILE), "utf8"));
  } catch {
    return [];
  }
};

/** A browser's bookmarks across its profiles. A page saved in two profiles is listed once. */
export const listBrowserBookmarks = (userDataFolder: string, limit: number): Bookmark[] => {
  const byUrl = new Map<string, Bookmark>();
  for (const profile of listProfileFolders(userDataFolder)) {
    for (const bookmark of readBookmarksFile(join(userDataFolder, profile))) {
      if (byUrl.size === limit) {
        return [...byUrl.values()];
      }
      if (!byUrl.has(bookmark.url)) {
        byUrl.set(bookmark.url, bookmark);
      }
    }
  }
  return [...byUrl.values()];
};
