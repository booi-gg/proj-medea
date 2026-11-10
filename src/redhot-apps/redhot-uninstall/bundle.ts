import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { listApps } from "../../launcher/apps.ts";
import type { App } from "../../launcher/apps.ts";
import { buildDir, configDir, logDir, loginItemPath } from "../../paths.ts";
import { runCommand } from "../../shell.ts";
import { findAppData, toAppIdentity } from "./match.ts";
import type { AppDataItem } from "./match.ts";

const APP_EXTENSION = ".app";
const SYSTEM_FOLDER = "/System/";
const LIBRARY_DIR = join(homedir(), "Library");
// A checkout's buildDir is its own .build, and it can still run beside an installed copy.
const REDHOT_PATHS = [
  buildDir,
  configDir,
  logDir,
  loginItemPath,
  join(LIBRARY_DIR, "Application Support", "Redhot"),
];

const toRealPath = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

/** False for the apps that come with macOS, which live on a volume nothing can change. */
export const canUninstall = (path: string): boolean =>
  isAbsolute(path) && path.endsWith(APP_EXTENSION) && !toRealPath(path).startsWith(SYSTEM_FOLDER);

/** True when any line of `ps` output is a program inside this bundle, helpers included. */
export const isRunningFrom = (commands: string, appPaths: readonly string[]): boolean => {
  const prefixes = appPaths.map((path) => `${path}/Contents/`);
  return commands.split("\n").some((line) => prefixes.some((prefix) => line.startsWith(prefix)));
};

export const isAppRunning = async ({ path }: App): Promise<boolean> => {
  const { stdout } = await runCommand("ps", ["-axww", "-o", "comm="]);
  return isRunningFrom(stdout, [path, toRealPath(path)]);
};

const readInfoValue = async (appPath: string, key: string): Promise<string | undefined> => {
  const infoPath = join(appPath, "Contents", "Info.plist");
  try {
    const { stdout } = await runCommand("plutil", ["-extract", key, "raw", "-o", "-", infoPath]);
    return stdout.trim();
  } catch {
    return undefined;
  }
};

export const findDataFor = async ({ name, path }: App): Promise<AppDataItem[]> => {
  const [bundleId, bundleName, apps] = await Promise.all([
    readInfoValue(path, "CFBundleIdentifier"),
    readInfoValue(path, "CFBundleName"),
    listApps(),
  ]);
  const otherAppNames = apps.filter((app) => app.path !== path).map((app) => app.name);
  const identity = toAppIdentity({ bundleId, appName: name, bundleName, otherAppNames });
  return identity === undefined ? [] : findAppData(identity, LIBRARY_DIR, REDHOT_PATHS);
};
