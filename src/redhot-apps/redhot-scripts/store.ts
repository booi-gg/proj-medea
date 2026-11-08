import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { scriptsDir } from "../../paths.ts";
import { parseScriptCommand } from "./parse.ts";
import type { ScriptCommand } from "./parse.ts";

// Deep enough to keep scripts in a folder per group.
const MAX_FOLDER_DEPTH = 3;
// Headers sit at the top, so only the start of each file is read.
const HEADER_BYTES = 16 * 1024;
const SKIPPED_FOLDERS = new Set(["node_modules"]);

export interface Script extends ScriptCommand {
  /** The path inside the scripts folder. Saved aliases and hotkeys use it. */
  id: string;
  path: string;
}

interface CachedHeaders {
  modifiedAt: number;
  size: number;
  command: ScriptCommand | undefined;
}

// Search lists items on every keystroke, so a file is only read again after it changes.
const headerCache = new Map<string, CachedHeaders>();

const readStart = (path: string): string => {
  const file = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const bytesRead = readSync(file, buffer, 0, HEADER_BYTES, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    closeSync(file);
  }
};

const findFiles = (folder: string, depth: number): string[] => {
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name)) {
      return [];
    }
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      return depth < MAX_FOLDER_DEPTH ? findFiles(path, depth + 1) : [];
    }
    return entry.isFile() || entry.isSymbolicLink() ? [path] : [];
  });
};

const readCommand = (path: string): ScriptCommand | undefined => {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return undefined;
  }
  if (!stats.isFile()) {
    return undefined;
  }
  const cached = headerCache.get(path);
  if (cached?.modifiedAt === stats.mtimeMs && cached.size === stats.size) {
    return cached.command;
  }
  let command: ScriptCommand | undefined;
  try {
    command = parseScriptCommand(readStart(path));
  } catch {
    command = undefined;
  }
  headerCache.set(path, { modifiedAt: stats.mtimeMs, size: stats.size, command });
  return command;
};

/** Every script command in the folder, sorted by title. Files without a title are skipped. */
export const listScripts = (folder: string = scriptsDir): Script[] =>
  findFiles(folder, 1)
    .flatMap((path) => {
      const command = readCommand(path);
      return command === undefined ? [] : [{ ...command, id: relative(folder, path), path }];
    })
    .sort((first, second) => first.title.localeCompare(second.title));
