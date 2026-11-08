import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { styleText } from "node:util";
import { runCommand } from "../../shell.ts";
import { toSafeName } from "../redhot-files/format.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { listDerivedDataProjects, listWorkspaceStorageProjects } from "./sources.ts";

const APP_ID = "redhot-projects";
const ICON = styleText("white", "◇");
const MAX_PROJECTS_PER_EDITOR = 30;
// Read when search asks, on every keystroke, so a scan is only done this often.
const CACHE_MS = 30_000;
const PROJECT_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".xcodeproj",
  ".xcworkspace",
  ".code-workspace",
]);

interface Editor {
  id: string;
  label: string;
  bundle: string;
  listProjects: (limit: number) => string[];
}

const toApplicationSupport = (...parts: readonly string[]): string =>
  join(homedir(), "Library", "Application Support", ...parts);

const toWorkspaceEditor = (
  id: string,
  label: string,
  bundle: string,
  supportFolder: string,
): Editor => ({
  id,
  label,
  bundle,
  listProjects: (limit) =>
    listWorkspaceStorageProjects(
      toApplicationSupport(supportFolder, "User", "workspaceStorage"),
      limit,
    ),
});

const EDITORS: readonly Editor[] = [
  toWorkspaceEditor("vscode", "VS Code", "Visual Studio Code.app", "Code"),
  toWorkspaceEditor("cursor", "Cursor", "Cursor.app", "Cursor"),
  {
    id: "xcode",
    label: "Xcode",
    bundle: "Xcode.app",
    listProjects: (limit) =>
      listDerivedDataProjects(
        join(homedir(), "Library", "Developer", "Xcode", "DerivedData"),
        limit,
      ),
  },
];

const findInstalledApp = (bundle: string): string | undefined =>
  ["/Applications", join(homedir(), "Applications")]
    .map((folder) => join(folder, bundle))
    .find((path) => existsSync(path));

/** "App.xcodeproj" is called App, and a plain folder keeps its whole name, dots included. */
export const toProjectName = (path: string): string => {
  const name = basename(path);
  const extension = extname(name);
  return PROJECT_FILE_EXTENSIONS.has(extension) ? name.slice(0, -extension.length) : name;
};

/** The parent folder is shown because two projects are often both called something like "web". */
export const toProjectKind = (label: string, path: string): string =>
  `${label} · ${toSafeName(basename(dirname(path)))}`;

const openProject = async (appPath: string, projectPath: string): Promise<string> => {
  try {
    await runCommand("open", ["-a", appPath, projectPath]);
    return "";
  } catch {
    // open's own message is a command line. The usual cause is something moved since it was used.
    throw new Error(`${toProjectName(projectPath)} couldn't be opened. It may have moved`);
  }
};

const toItem = ({ id, label }: Editor, appPath: string, projectPath: string): LauncherItem => ({
  value: `${APP_ID}:${id}:${projectPath}`,
  name: toSafeName(toProjectName(projectPath)),
  icon: ICON,
  kind: toProjectKind(label, projectPath),
  ranksAfterApps: true,
  run: () => openProject(appPath, projectPath),
});

const scanItems = (): LauncherItem[] =>
  EDITORS.flatMap((editor) => {
    const appPath = findInstalledApp(editor.bundle);
    return appPath === undefined
      ? []
      : editor
          .listProjects(MAX_PROJECTS_PER_EDITOR)
          .map((projectPath) => toItem(editor, appPath, projectPath));
  });

let cached: { items: LauncherItem[]; scannedAt: number } | undefined;

const listItems = (): LauncherItem[] => {
  const now = Date.now();
  if (cached === undefined || now - cached.scannedAt > CACHE_MS) {
    cached = { items: scanItems(), scannedAt: now };
  }
  return cached.items;
};

export const recentProjects: RedhotApp = {
  id: APP_ID,
  listItems,
  listSettingsActions: () => [],
};
