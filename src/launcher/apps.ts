import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { runCommand } from "../shell.ts";

const APP_EXTENSION = ".app";
const FINDER_PATH = "/System/Library/CoreServices/Finder.app";
// Reaches apps in a vendor folder, like /Applications/Adobe Photoshop/Photoshop.app.
const MAX_FOLDER_DEPTH = 2;

export interface App {
  name: string;
  path: string;
}

/**
 * Finds .app bundles by reading folders, so the list doesn't depend on Spotlight's index, which
 * was missing at least one installed app. Bundles are never opened, so helpers stay out.
 */
export const findAppPaths = async (folder: string, depth: number): Promise<string[]> => {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const visible = entries.filter(({ name }) => !name.startsWith("."));

  const appPaths = visible
    .filter(({ name }) => name.endsWith(APP_EXTENSION))
    .map(({ name }) => join(folder, name));

  if (depth === 0) {
    return appPaths;
  }
  const subfolders = visible.filter(
    (entry) => entry.isDirectory() && !entry.name.endsWith(APP_EXTENSION),
  );
  const nestedPaths = await Promise.all(
    subfolders.map(({ name }) => findAppPaths(join(folder, name), depth - 1)),
  );
  return [...appPaths, ...nestedPaths.flat()];
};

export const toApps = (paths: readonly string[]): App[] => {
  const appsByName = new Map<string, App>();
  for (const path of paths.toSorted()) {
    const name = basename(path, APP_EXTENSION);
    if (!appsByName.has(name)) {
      appsByName.set(name, { name, path });
    }
  }
  return [...appsByName.values()].toSorted((first, second) =>
    first.name.localeCompare(second.name),
  );
};

export const listApps = async (): Promise<App[]> => {
  const folders = ["/Applications", "/System/Applications", join(homedir(), "Applications")];
  const paths = await Promise.all(folders.map((folder) => findAppPaths(folder, MAX_FOLDER_DEPTH)));
  return toApps([...paths.flat(), FINDER_PATH]);
};

export const openApp = async (path: string): Promise<void> => {
  await runCommand("open", [path]);
};
