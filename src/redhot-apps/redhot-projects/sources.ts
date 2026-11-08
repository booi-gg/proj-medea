import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Older folders are ignored, so a long history costs nothing and search stays quick.
const MAX_FOLDERS_TO_CHECK = 100;
const WORKSPACE_FILE = "workspace.json";
// Rewritten as you use a project, while the folder's own date stays put.
const WORKSPACE_ACTIVITY_FILE = "state.vscdb";
const DERIVED_DATA_INFO_FILE = "info.plist";
const FILE_URI_START = "file:";
const WORKSPACE_PATH_KEY = /<key>WorkspacePath<\/key>\s*<string>([^<]+)<\/string>/u;
const XML_ENTITY = /&(amp|lt|gt|quot|apos);/gu;
const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

interface UsedFolder {
  folder: string;
  usedAt: number;
}

const toUsedFolder = (root: string, name: string, activityFile: string): UsedFolder | undefined => {
  const folder = join(root, name);
  try {
    return { folder, usedAt: statSync(join(folder, activityFile)).mtimeMs };
  } catch {
    return undefined;
  }
};

/** The folders under root that were used most recently, newest first. */
const listUsedFolders = (root: string, activityFile: string): UsedFolder[] => {
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  return names
    .flatMap((name) => toUsedFolder(root, name, activityFile) ?? [])
    .toSorted((first, second) => second.usedAt - first.usedAt)
    .slice(0, MAX_FOLDERS_TO_CHECK);
};

const readTextIfPresent = (path: string): string | undefined => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/** Keeps projects still on disk, once each, stopping as soon as there are enough. */
const toProjectPaths = (
  folders: readonly UsedFolder[],
  readProjectPath: (folder: string) => string | undefined,
  limit: number,
): string[] => {
  const paths = new Set<string>();
  for (const { folder } of folders) {
    const path = readProjectPath(folder);
    if (path !== undefined && existsSync(path)) {
      paths.add(path);
    }
    if (paths.size === limit) {
      break;
    }
  }
  return [...paths];
};

const toLocalPath = (uri: unknown): string | undefined => {
  if (typeof uri !== "string" || !uri.startsWith(FILE_URI_START)) {
    return undefined;
  }
  try {
    return fileURLToPath(uri);
  } catch {
    return undefined;
  }
};

/** The project in a workspace.json. A remote one has no local path, so it's left out. */
export const parseWorkspaceFile = (text: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    return "folder" in parsed
      ? toLocalPath(parsed.folder)
      : "workspace" in parsed
        ? toLocalPath(parsed.workspace)
        : undefined;
  } catch {
    return undefined;
  }
};

/** The project in one of Xcode's build folders. */
export const parseDerivedDataInfo = (text: string): string | undefined => {
  const [, path] = WORKSPACE_PATH_KEY.exec(text) ?? [];
  return path?.replace(XML_ENTITY, (_entity, name: string) => XML_ENTITIES[name] ?? "");
};

/** VS Code and its forks each keep one folder per project, in workspaceStorage. */
export const listWorkspaceStorageProjects = (root: string, limit: number): string[] =>
  toProjectPaths(
    listUsedFolders(root, WORKSPACE_ACTIVITY_FILE),
    (folder) => {
      const text = readTextIfPresent(join(folder, WORKSPACE_FILE));
      return text === undefined ? undefined : parseWorkspaceFile(text);
    },
    limit,
  );

/**
 * Xcode has one build folder per project, which says where the project is. Its own recent list is
 * in a place macOS blocks, and the list in its preferences is recent files, not projects.
 */
export const listDerivedDataProjects = (root: string, limit: number): string[] =>
  toProjectPaths(
    listUsedFolders(root, DERIVED_DATA_INFO_FILE),
    (folder) => {
      const text = readTextIfPresent(join(folder, DERIVED_DATA_INFO_FILE));
      return text === undefined ? undefined : parseDerivedDataInfo(text);
    },
    limit,
  );
