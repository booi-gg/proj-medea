import { homedir } from "node:os";
import { basename } from "node:path";
import { runCommand } from "../shell.ts";

const APP_EXTENSION = ".app";
const APP_BUNDLE_QUERY = "kMDItemContentType == 'com.apple.application-bundle'";
const FINDER_PATH = "/System/Library/CoreServices/Finder.app";
const MAX_MDFIND_OUTPUT_BYTES = 10 * 1024 * 1024;

export interface App {
  name: string;
  path: string;
}

const isLaunchableApp = (path: string, roots: readonly string[]): boolean => {
  if (path === FINDER_PATH) {
    return true;
  }
  const root = roots.find((candidate) => path.startsWith(candidate));
  if (root === undefined || !path.endsWith(APP_EXTENSION)) {
    return false;
  }
  const isNestedInAnotherApp = path.slice(root.length).includes(`${APP_EXTENSION}/`);
  return !isNestedInAnotherApp;
};

export const toApps = (paths: readonly string[], homeDir: string): App[] => {
  const roots = ["/Applications/", "/System/Applications/", `${homeDir}/Applications/`];
  const appsByName = new Map<string, App>();

  for (const path of paths.toSorted()) {
    const name = basename(path, APP_EXTENSION);
    if (isLaunchableApp(path, roots) && !appsByName.has(name)) {
      appsByName.set(name, { name, path });
    }
  }
  return [...appsByName.values()].toSorted((first, second) =>
    first.name.localeCompare(second.name),
  );
};

export const listApps = async (): Promise<App[]> => {
  const { stdout } = await runCommand("mdfind", [APP_BUNDLE_QUERY], {
    maxBuffer: MAX_MDFIND_OUTPUT_BYTES,
  });
  return toApps(stdout.trim().split("\n"), homedir());
};

export const openApp = async (path: string): Promise<void> => {
  await runCommand("open", [path]);
};
