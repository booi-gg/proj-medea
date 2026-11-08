import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { isObject, parseConfig } from "../config.ts";
import type { Config } from "../config.ts";
import { reloadHotkeys } from "../menubar/helper.ts";
import { reloadSnippets } from "../menubar/helper-socket.ts";
import {
  configPath,
  logDir,
  quicklinksPath,
  snippetsPath,
  syncOutboxDir,
  syncStatePath,
} from "../paths.ts";
import { runCommand } from "../shell.ts";
import { readTextIfPresent, withStorageLock, writeAtomic } from "../storage.ts";
import { parseQuicklinks } from "../redhot-apps/redhot-quicklinks/store.ts";
import type { Quicklink } from "../redhot-apps/redhot-quicklinks/store.ts";
import { parseSnippets } from "../redhot-apps/redhot-snippets/store.ts";
import type { Snippet } from "../redhot-apps/redhot-snippets/store.ts";
import { coordinatedCopy } from "./bridge.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_RETENTION_MS = 30 * DAY_MS;
const LOG_LIMIT_BYTES = 50 * 1024 * 1024;
const MAX_OPERATION_BYTES = 64 * 1024;
// Leaves room in an operation for its other fields. Every Mac refuses a change over the limit, so
// one that got out would stop sync on all of them.
const MAX_SYNCED_SNIPPET_BYTES = 48 * 1024;
const ICLOUD_DRIVE_ROOT = "com~apple~CloudDocs";
const LOG_NAME = /^redhot(?:\..+)?\.log$/;
const SAFE_FILE_NAME = /^[a-zA-Z0-9-]+\.(?:json|jsonl)$/;

const readDirectory = async (path: string): Promise<string[]> => {
  try {
    return await readdir(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
};

export interface SyncPaths {
  config: string;
  quicklinks: string;
  snippets: string;
  state: string;
  outbox: string;
  logs: string;
  coordinated: boolean;
}

const defaultPaths: SyncPaths = {
  config: configPath,
  quicklinks: quicklinksPath,
  snippets: snippetsPath,
  state: syncStatePath,
  outbox: syncOutboxDir,
  logs: logDir,
  coordinated: process.platform === "darwin",
};

const withSyncLock = <Result>(paths: SyncPaths, run: () => Promise<Result>): Promise<Result> =>
  withStorageLock(run, dirname(paths.state));

interface Revision {
  deviceId: string;
  sequence: number;
  timestamp: number;
}

interface Operation extends Revision {
  id: string;
  key: string;
  base?: Revision;
  value?: unknown;
  deleted?: true;
}

interface SyncConflict {
  key: string;
  otherValue?: string;
  occurredAt: string;
}

/** What this Mac shares. Each Mac chooses for itself. */
export interface SyncChoices {
  settingsEnabled: boolean;
  quicklinksEnabled: boolean;
  snippetsEnabled: boolean;
  logsEnabled: boolean;
}

// Snippets start off because their text goes into iCloud Drive as plain files.
const DEFAULT_SYNC_CHOICES: SyncChoices = {
  settingsEnabled: true,
  quicklinksEnabled: true,
  snippetsEnabled: false,
  logsEnabled: true,
};

interface SyncState extends SyncChoices {
  deviceId: string;
  folder?: string;
  paused: boolean;
  sequence: number;
  observed: Record<string, string>;
  revisions: Record<string, Revision>;
  seenOperations: Record<string, true>;
  /** Changes that arrived while their kind was switched off, applied when it's back on. */
  deferred: Record<string, Operation>;
  logOffsets: Record<string, number>;
  lastSyncAt?: string;
  error?: string;
  conflicts: SyncConflict[];
}

export interface SyncStatus extends SyncChoices {
  enabled: boolean;
  paused: boolean;
  folder?: string;
  deviceId?: string;
  lastSyncAt?: string;
  error?: string;
  conflicts: number;
  pending: number;
}

const emptyState = (): SyncState => ({
  ...DEFAULT_SYNC_CHOICES,
  deviceId: randomUUID(),
  paused: false,
  sequence: 0,
  observed: {},
  revisions: {},
  seenOperations: {},
  deferred: {},
  logOffsets: {},
  conflicts: [],
});

const parseDeferred = (value: unknown): Record<string, Operation> =>
  isObject(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, Operation] =>
            isOperation(entry[1]) && isValidOperation(entry[1]),
        ),
      )
    : {};

const parseState = (text: string): SyncState => {
  const value: unknown = JSON.parse(text);
  if (!isObject(value) || typeof value.deviceId !== "string" || !isObject(value.observed)) {
    throw new Error("The Redhot sync state is damaged. Fix it before syncing.");
  }
  return {
    deviceId: value.deviceId,
    folder: typeof value.folder === "string" ? value.folder : undefined,
    paused: value.paused === true,
    // A state file saved before these existed synced settings and quicklinks, but not snippets.
    settingsEnabled: value.settingsEnabled !== false,
    quicklinksEnabled: value.quicklinksEnabled !== false,
    snippetsEnabled: value.snippetsEnabled === true,
    logsEnabled: value.logsEnabled !== false,
    deferred: parseDeferred(value.deferred),
    sequence: typeof value.sequence === "number" ? value.sequence : 0,
    observed: value.observed as Record<string, string>,
    revisions: isObject(value.revisions) ? (value.revisions as Record<string, Revision>) : {},
    seenOperations: isObject(value.seenOperations)
      ? (value.seenOperations as Record<string, true>)
      : {},
    logOffsets: isObject(value.logOffsets) ? (value.logOffsets as Record<string, number>) : {},
    lastSyncAt: typeof value.lastSyncAt === "string" ? value.lastSyncAt : undefined,
    error: typeof value.error === "string" ? value.error : undefined,
    conflicts: Array.isArray(value.conflicts)
      ? value.conflicts.filter(
          (entry): entry is SyncConflict =>
            isObject(entry) &&
            typeof entry.key === "string" &&
            typeof entry.occurredAt === "string" &&
            (entry.otherValue === undefined || typeof entry.otherValue === "string"),
        )
      : [],
  };
};

const readState = async (paths: SyncPaths): Promise<SyncState> => {
  const text = await readTextIfPresent(paths.state);
  return text === undefined ? emptyState() : parseState(text);
};

const saveState = async (paths: SyncPaths, state: SyncState): Promise<void> => {
  await writeAtomic(paths.state, `${JSON.stringify(state, null, 2)}\n`);
};

export const readSyncStatusSync = (paths: SyncPaths = defaultPaths): SyncStatus => {
  try {
    const state = parseState(readFileSync(paths.state, "utf8"));
    return {
      enabled: state.folder !== undefined,
      paused: state.paused,
      settingsEnabled: state.settingsEnabled,
      quicklinksEnabled: state.quicklinksEnabled,
      snippetsEnabled: state.snippetsEnabled,
      logsEnabled: state.logsEnabled,
      folder: state.folder,
      deviceId: state.deviceId,
      lastSyncAt: state.lastSyncAt,
      error: state.error,
      conflicts: state.conflicts.length,
      pending: 0,
    };
  } catch {
    return {
      ...DEFAULT_SYNC_CHOICES,
      enabled: false,
      paused: false,
      conflicts: 0,
      pending: 0,
    };
  }
};

export const readSyncStatus = async (paths: SyncPaths = defaultPaths): Promise<SyncStatus> => {
  const status = readSyncStatusSync(paths);
  if (!status.enabled) return status;
  const entries = await readDirectory(paths.outbox);
  const logs = await readDirectory(join(paths.outbox, "logs"));
  return {
    ...status,
    pending: entries.filter((name) => name.endsWith(".json")).length + logs.length,
  };
};

/** The name to show for a sync folder. iCloud Drive's own top folder has an odd one on disk. */
export const toSyncFolderName = (folder: string): string => {
  const name = basename(folder);
  return name === ICLOUD_DRIVE_ROOT ? "iCloud Drive" : name;
};

const isKeySynced = (choices: SyncChoices, key: string): boolean => {
  if (key.startsWith("quicklink:")) return choices.quicklinksEnabled;
  if (key.startsWith("snippet:")) return choices.snippetsEnabled;
  return choices.settingsEnabled;
};

interface LocalData {
  config: Config;
  links: Quicklink[];
  snippets: Snippet[];
}

const portable = (key: string): boolean => !key.startsWith("/");
const toEntries = ({ config, links, snippets }: LocalData): Record<string, string> => {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.aliases)) {
    if (portable(key)) entries[`alias:${key}`] = JSON.stringify(value);
  }
  for (const [key, value] of Object.entries(config.hotkeys)) {
    if (portable(key)) entries[`hotkey:${key}`] = JSON.stringify(value);
  }
  if (config.clipboardHistoryMonths !== undefined) {
    entries.clipboardHistoryMonths = JSON.stringify(config.clipboardHistoryMonths);
  }
  for (const { id, name, link } of links) {
    entries[`quicklink:${id}`] = JSON.stringify({ id, name, link });
  }
  for (const { id, name, keyword, text } of snippets) {
    entries[`snippet:${id}`] = JSON.stringify({
      id,
      name,
      ...(keyword === undefined ? {} : { keyword }),
      text,
    });
  }
  return entries;
};

const readLocalConfig = async (paths: SyncPaths): Promise<Config> => {
  const configText = await readTextIfPresent(paths.config);
  if (configText !== undefined) {
    const rawConfig: unknown = JSON.parse(configText);
    if (
      !isObject(rawConfig) ||
      (rawConfig.aliases !== undefined && !isObject(rawConfig.aliases)) ||
      (rawConfig.hotkeys !== undefined && !isObject(rawConfig.hotkeys))
    ) {
      throw new Error("The local Redhot config is damaged. Fix it before syncing.");
    }
  }
  return parseConfig(configText ?? "{}");
};

const readLocalLinks = async (paths: SyncPaths): Promise<Quicklink[]> => {
  const linksText = await readTextIfPresent(paths.quicklinks);
  if (linksText === undefined) return [];
  const rawLinks: unknown = JSON.parse(linksText);
  const links = parseQuicklinks(linksText);
  if (!Array.isArray(rawLinks) || rawLinks.length !== links.length) {
    throw new Error("The local Quicklinks file is damaged. Fix it before syncing.");
  }
  return links;
};

const readLocalSnippets = async (paths: SyncPaths): Promise<Snippet[]> => {
  const snippetsText = await readTextIfPresent(paths.snippets);
  if (snippetsText === undefined) return [];
  const rawSnippets: unknown = JSON.parse(snippetsText);
  const snippets = parseSnippets(snippetsText);
  if (!Array.isArray(rawSnippets) || rawSnippets.length !== snippets.length) {
    throw new Error("The local Snippets file is damaged. Fix it before syncing.");
  }
  for (const snippet of snippets) {
    if (Buffer.byteLength(JSON.stringify(snippet)) > MAX_SYNCED_SNIPPET_BYTES) {
      throw new Error(`The snippet ${snippet.name} is too long to sync. Shorten it first.`);
    }
  }
  return snippets;
};

/** Leaves the files of anything switched off unread, so a problem in one can't stop the rest. */
const readLocal = async (paths: SyncPaths, choices: SyncChoices): Promise<LocalData> => ({
  config: choices.settingsEnabled ? await readLocalConfig(paths) : parseConfig("{}"),
  links: choices.quicklinksEnabled ? await readLocalLinks(paths) : [],
  snippets: choices.snippetsEnabled ? await readLocalSnippets(paths) : [],
});

/** What was last seen of anything switched off is kept, so turning it off can't read as deleting. */
const setObserved = (state: SyncState, current: Record<string, string>): void => {
  const switchedOff = Object.entries(state.observed).filter(([key]) => !isKeySynced(state, key));
  state.observed = { ...Object.fromEntries(switchedOff), ...current };
};

const compareRevision = (first: Revision, second: Revision | undefined): number => {
  if (second === undefined) return 1;
  const deviceOrder =
    first.deviceId < second.deviceId ? -1 : first.deviceId > second.deviceId ? 1 : 0;
  return first.timestamp - second.timestamp || deviceOrder || first.sequence - second.sequence;
};

const isOperation = (value: unknown): value is Operation =>
  isObject(value) &&
  typeof value.id === "string" &&
  typeof value.key === "string" &&
  typeof value.deviceId === "string" &&
  typeof value.timestamp === "number" &&
  typeof value.sequence === "number" &&
  (value.deleted === true || "value" in value);

const isValidOperation = (operation: Operation): boolean => {
  const { key, value } = operation;
  const knownKey =
    key === "clipboardHistoryMonths" ||
    (key.startsWith("alias:") && portable(key.slice(6))) ||
    (key.startsWith("hotkey:") && portable(key.slice(7))) ||
    key.startsWith("quicklink:") ||
    key.startsWith("snippet:");
  if (!knownKey) return false;
  if (operation.deleted === true) return true;
  if (key.startsWith("alias:")) {
    return (
      portable(key.slice(6)) &&
      Array.isArray(value) &&
      value.every((part) => typeof part === "string")
    );
  }
  if (key.startsWith("hotkey:")) return portable(key.slice(7)) && typeof value === "string";
  if (key === "clipboardHistoryMonths") return [3, 4, 5, 12].includes(value as number);
  if (key.startsWith("quicklink:") && isObject(value)) {
    return (
      value.id === key.slice(10) && typeof value.name === "string" && typeof value.link === "string"
    );
  }
  if (key.startsWith("snippet:") && isObject(value)) {
    return (
      value.id === key.slice(8) &&
      typeof value.name === "string" &&
      typeof value.text === "string" &&
      (value.keyword === undefined || typeof value.keyword === "string")
    );
  }
  return false;
};

const recordLocalChanges = async (paths: SyncPaths, state: SyncState): Promise<void> => {
  const current = toEntries(await readLocal(paths, state));
  const keys = new Set(
    [...Object.keys(state.observed), ...Object.keys(current)].filter((key) =>
      isKeySynced(state, key),
    ),
  );
  for (const key of keys) {
    if (state.observed[key] === current[key]) continue;
    state.sequence += 1;
    const operation: Operation = {
      id: randomUUID(),
      deviceId: state.deviceId,
      sequence: state.sequence,
      timestamp: Date.now(),
      key,
      base: state.revisions[key],
      ...(current[key] === undefined
        ? { deleted: true }
        : { value: JSON.parse(current[key]) as unknown }),
    };
    await writeAtomic(join(paths.outbox, `${operation.id}.json`), `${JSON.stringify(operation)}\n`);
    state.revisions[key] = operation;
    state.seenOperations[operation.id] = true;
  }
  setObserved(state, current);
  await saveState(paths, state);
};

const applyEntries = async (
  paths: SyncPaths,
  choices: SyncChoices,
  entries: Record<string, string>,
): Promise<void> => {
  const { config, links } = await readLocal(paths, choices);
  const aliases: Config["aliases"] = Object.fromEntries(
    Object.entries(config.aliases).filter(([key]) => !portable(key)),
  );
  const hotkeys: Config["hotkeys"] = Object.fromEntries(
    Object.entries(config.hotkeys).filter(([key]) => !portable(key)),
  );
  const localOpenWith = new Map(links.map(({ id, openWith }) => [id, openWith]));
  const syncedLinks: Quicklink[] = [];
  const syncedSnippets: Snippet[] = [];
  let clipboardHistoryMonths: Config["clipboardHistoryMonths"];
  for (const [key, text] of Object.entries(entries)) {
    const value: unknown = JSON.parse(text);
    if (key.startsWith("alias:") && Array.isArray(value)) {
      const item = key.slice("alias:".length);
      if (portable(item) && value.every((part) => typeof part === "string")) aliases[item] = value;
    } else if (key.startsWith("hotkey:") && typeof value === "string") {
      const item = key.slice("hotkey:".length);
      if (portable(item)) hotkeys[item] = value;
    } else if (key === "clipboardHistoryMonths" && [3, 4, 5, 12].includes(value as number)) {
      clipboardHistoryMonths = value as Config["clipboardHistoryMonths"];
    } else if (key.startsWith("quicklink:") && isObject(value)) {
      const id = key.slice("quicklink:".length);
      if (value.id === id && typeof value.name === "string" && typeof value.link === "string") {
        const openWith = localOpenWith.get(id);
        syncedLinks.push({
          id,
          name: value.name,
          link: value.link,
          ...(openWith ? { openWith } : {}),
        });
      }
    } else if (key.startsWith("snippet:") && isObject(value)) {
      const id = key.slice("snippet:".length);
      const { name, keyword, text: body } = value;
      if (value.id === id && typeof name === "string" && typeof body === "string") {
        syncedSnippets.push({
          id,
          name,
          ...(typeof keyword === "string" ? { keyword } : {}),
          text: body,
        });
      }
    }
  }
  if (choices.settingsEnabled) {
    const nextConfig = { ...config, aliases, hotkeys, clipboardHistoryMonths };
    await writeAtomic(paths.config, `${JSON.stringify(nextConfig, null, 2)}\n`);
  }
  if (choices.quicklinksEnabled) {
    await writeAtomic(paths.quicklinks, `${JSON.stringify(syncedLinks, null, 2)}\n`);
  }
  if (choices.snippetsEnabled) {
    await writeAtomic(paths.snippets, `${JSON.stringify(syncedSnippets, null, 2)}\n`);
  }
};

const copy = async (
  paths: SyncPaths,
  direction: "read" | "write",
  source: string,
  destination: string,
): Promise<void> => {
  if (paths.coordinated) {
    await coordinatedCopy(direction, source, destination);
    return;
  }
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
};

const publishOutbox = async (paths: SyncPaths, state: SyncState): Promise<void> => {
  if (state.folder === undefined) return;
  const ownDirectory = join(state.folder, "devices", state.deviceId);
  for (const name of await readDirectory(paths.outbox)) {
    if (!name.endsWith(".json")) continue;
    const source = join(paths.outbox, name);
    const target = join(ownDirectory, "changes", name);
    if (!existsSync(target)) await copy(paths, "write", source, target);
    await rm(source, { force: true });
  }
  if (!state.logsEnabled) return;
  const logOutbox = join(paths.outbox, "logs");
  for (const name of await readDirectory(logOutbox)) {
    if (!SAFE_FILE_NAME.test(name)) continue;
    const source = join(logOutbox, name);
    const target = join(ownDirectory, "logs", name);
    if (!existsSync(target)) await copy(paths, "write", source, target);
    await rm(source, { force: true });
  }
};

const collectChanges = async (
  paths: SyncPaths,
  state: SyncState,
  staging: string,
): Promise<Operation[]> => {
  if (state.folder === undefined) return [];
  const devices = join(state.folder, "devices");
  const operations: Operation[] = [];
  for (const deviceId of await readDirectory(devices)) {
    if (deviceId === state.deviceId || !/^[a-f0-9-]{36}$/i.test(deviceId)) continue;
    const directory = join(devices, deviceId, "changes");
    for (const name of await readDirectory(directory)) {
      if (!/^[a-f0-9-]{36}\.json$/i.test(name)) continue;
      if (state.seenOperations[name.slice(0, -5)]) continue;
      const target = join(staging, name);
      await copy(paths, "read", join(directory, name), target);
      const data = await readFile(target);
      if (data.length > MAX_OPERATION_BYTES) throw new Error("A synced change is too large");
      const parsed: unknown = JSON.parse(data.toString("utf8"));
      if (
        !isOperation(parsed) ||
        !isValidOperation(parsed) ||
        parsed.deviceId !== deviceId ||
        `${parsed.id}.json` !== name
      ) {
        throw new Error("A synced change is invalid");
      }
      operations.push(parsed);
    }
  }
  return operations.sort(compareRevision);
};

/**
 * Holds only the newest change for each key, with the oldest one's base. Applied later, it then
 * follows on from what this Mac last had, so a run of edits elsewhere doesn't look like a conflict.
 */
const deferOperation = (state: SyncState, operation: Operation): void => {
  const held = state.deferred[operation.key];
  if (held === undefined) {
    state.deferred[operation.key] = operation;
    return;
  }
  const [older, newer] =
    compareRevision(operation, held) > 0 ? [held, operation] : [operation, held];
  state.deferred[operation.key] = { ...newer, base: older.base };
};

const takeDeferredOperations = (state: SyncState): Operation[] => {
  const ready = Object.values(state.deferred).filter(({ key }) => isKeySynced(state, key));
  for (const { key } of ready) delete state.deferred[key];
  return ready;
};

const applyChanges = async (paths: SyncPaths, operations: readonly Operation[]): Promise<number> =>
  withSyncLock(paths, async () => {
    const state = await readState(paths);
    await recordLocalChanges(paths, state);
    const entries = toEntries(await readLocal(paths, state));
    const unseen = operations.filter(({ id }) => !state.seenOperations[id]);
    const incomingOperations = [...takeDeferredOperations(state), ...unseen].sort(compareRevision);
    let imported = 0;
    for (const operation of incomingOperations) {
      state.seenOperations[operation.id] = true;
      if (!isKeySynced(state, operation.key)) {
        deferOperation(state, operation);
        continue;
      }
      const revision = state.revisions[operation.key];
      const incoming = operation.deleted ? undefined : JSON.stringify(operation.value);
      const isConcurrent =
        revision !== undefined &&
        (operation.base === undefined ||
          operation.base.deviceId !== revision.deviceId ||
          operation.base.sequence !== revision.sequence);
      const incomingWins = compareRevision(operation, revision) > 0;
      if (isConcurrent && entries[operation.key] !== incoming) {
        const otherValue = incomingWins ? entries[operation.key] : incoming;
        const existingConflict = state.conflicts.find((conflict) => conflict.key === operation.key);
        if (existingConflict === undefined) {
          state.conflicts.push({
            key: operation.key,
            otherValue,
            occurredAt: new Date().toISOString(),
          });
        } else {
          existingConflict.otherValue = otherValue;
        }
      }
      if (!incomingWins) continue;
      if (operation.deleted) delete entries[operation.key];
      else entries[operation.key] = incoming as string;
      state.revisions[operation.key] = operation;
      imported += 1;
    }
    if (imported > 0) {
      await applyEntries(paths, state, entries);
      setObserved(state, toEntries(await readLocal(paths, state)));
    }
    await saveState(paths, state);
    return imported;
  });

export const listSyncConflicts = async (paths: SyncPaths = defaultPaths): Promise<SyncConflict[]> =>
  (await readState(paths)).conflicts;

export const resolveSyncConflict = async (
  key: string,
  restoreOther: boolean,
  paths: SyncPaths = defaultPaths,
): Promise<void> => {
  await withSyncLock(paths, async () => {
    const state = await readState(paths);
    const conflict = state.conflicts.find((entry) => entry.key === key);
    if (conflict === undefined) return;
    if (restoreOther) {
      if (!isKeySynced(state, key)) {
        throw new Error("Turn this on under What to Sync first, then restore it");
      }
      const entries = toEntries(await readLocal(paths, state));
      if (conflict.otherValue === undefined) delete entries[key];
      else entries[key] = conflict.otherValue;
      await applyEntries(paths, state, entries);
      await recordLocalChanges(paths, state);
    }
    state.conflicts = state.conflicts.filter((entry) => entry.key !== key);
    await saveState(paths, state);
  });
};

const stageLogs = async (paths: SyncPaths, state: SyncState): Promise<void> => {
  if (!state.logsEnabled) return;
  for (const name of await readDirectory(paths.logs)) {
    if (!LOG_NAME.test(name)) continue;
    const path = join(paths.logs, name);
    const info = await stat(path);
    if (!info.isFile()) continue;
    const key = `${info.dev}:${info.ino}`;
    const offset = Math.min(state.logOffsets[key] ?? 0, info.size);
    if (offset === info.size) continue;
    const file = await readFile(path);
    const slice = file.subarray(offset);
    const newline = slice.lastIndexOf(10);
    if (newline < 0) continue;
    const segment = slice.subarray(0, newline + 1);
    await writeAtomic(
      join(paths.outbox, "logs", `${randomUUID()}.jsonl`),
      segment.toString("utf8"),
    );
    state.logOffsets[key] = offset + segment.length;
  }
  await saveState(paths, state);
};

const collectLogs = async (paths: SyncPaths, state: SyncState): Promise<void> => {
  if (!state.logsEnabled || state.folder === undefined) return;
  const devices = join(state.folder, "devices");
  for (const deviceId of await readDirectory(devices)) {
    if (deviceId === state.deviceId || !/^[a-f0-9-]{36}$/i.test(deviceId)) continue;
    for (const name of await readDirectory(join(devices, deviceId, "logs"))) {
      if (!SAFE_FILE_NAME.test(name) || !name.endsWith(".jsonl")) continue;
      const target = join(paths.logs, "synced", deviceId, name);
      if (!existsSync(target))
        await copy(paths, "read", join(devices, deviceId, "logs", name), target);
    }
    await pruneLogDirectory(join(paths.logs, "synced", deviceId));
  }
};

const pruneLogDirectory = async (directory: string): Promise<void> => {
  const files = await Promise.all(
    (await readDirectory(directory))
      .filter((name) => SAFE_FILE_NAME.test(name) && name.endsWith(".jsonl"))
      .map(async (name) => {
        const path = join(directory, name);
        const info = await stat(path);
        return { path, size: info.size, modified: info.mtimeMs };
      }),
  );
  files.sort((first, second) => first.modified - second.modified);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files) {
    if (Date.now() - file.modified <= LOG_RETENTION_MS && total <= LOG_LIMIT_BYTES) break;
    await rm(file.path, { force: true });
    total -= file.size;
  }
};

const pruneOwnLogs = async (state: SyncState): Promise<void> => {
  if (state.folder === undefined) return;
  await pruneLogDirectory(join(state.folder, "devices", state.deviceId, "logs"));
};

export const configureSync = async (
  folder: string,
  paths: SyncPaths = defaultPaths,
): Promise<void> => {
  const info = await stat(folder);
  if (!info.isDirectory()) throw new Error("Choose a folder for Redhot Sync");
  await withSyncLock(paths, async () => {
    const state = await readState(paths);
    if (state.folder !== folder) {
      state.observed = {};
      state.revisions = {};
      state.seenOperations = {};
      state.deferred = {};
      state.lastSyncAt = undefined;
    }
    // Moving an existing setup to another folder leaves a pause in place.
    state.paused = state.folder === undefined ? false : state.paused;
    state.folder = folder;
    state.error = undefined;
    await saveState(paths, state);
  });
};

export const changeSyncSettings = async (
  changes: { paused?: boolean; disconnect?: boolean },
  paths: SyncPaths = defaultPaths,
): Promise<void> => {
  await withSyncLock(paths, async () => {
    const state = await readState(paths);
    if (changes.disconnect) {
      state.folder = undefined;
      state.lastSyncAt = undefined;
    }
    if (changes.paused !== undefined) state.paused = changes.paused;
    await saveState(paths, state);
  });
};

export const setSyncChoice = async (
  choice: keyof SyncChoices,
  enabled: boolean,
  paths: SyncPaths = defaultPaths,
): Promise<void> => {
  await withSyncLock(paths, async () => {
    const state = await readState(paths);
    state[choice] = enabled;
    await saveState(paths, state);
  });
};

export const openSyncFolder = async (paths: SyncPaths = defaultPaths): Promise<void> => {
  const folder = (await readState(paths)).folder;
  if (folder === undefined) throw new Error("Set up iCloud Drive sync first");
  await runCommand("open", [folder]);
};

export const removeThisDevicesSyncedLogs = async (
  paths: SyncPaths = defaultPaths,
): Promise<void> => {
  const state = await readState(paths);
  if (state.folder === undefined) throw new Error("Set up iCloud Drive sync first");
  const directory = join(state.folder, "devices", state.deviceId, "logs");
  for (const name of await readDirectory(directory)) {
    if (SAFE_FILE_NAME.test(name) && name.endsWith(".jsonl")) {
      await rm(join(directory, name), { force: true });
    }
  }
  await rm(join(paths.outbox, "logs"), { recursive: true, force: true });
};

export const syncNow = async (paths: SyncPaths = defaultPaths): Promise<SyncStatus> => {
  const initial = await readState(paths);
  if (initial.folder === undefined || initial.paused) return readSyncStatus(paths);
  const runLock = `${paths.state}.running`;
  try {
    await mkdir(runLock);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      const age = Date.now() - (await stat(runLock)).mtimeMs;
      if (age > 10 * 60_000) {
        await rm(runLock, { recursive: true, force: true });
        return syncNow(paths);
      }
      return readSyncStatus(paths);
    }
    throw error;
  }
  let staging: string | undefined;
  try {
    const folderInfo = await stat(initial.folder);
    if (!folderInfo.isDirectory()) throw new Error("The iCloud Drive sync folder is unavailable");
    await mkdir(join(initial.folder, "devices"), { recursive: true });
    staging = await mkdtemp(join(tmpdir(), "redhot-sync-"));
    await withSyncLock(paths, async () => {
      const state = await readState(paths);
      await recordLocalChanges(paths, state);
      await stageLogs(paths, state);
    });
    const state = await readState(paths);
    await publishOutbox(paths, state);
    const operations = await collectChanges(paths, state, staging);
    const imported = await applyChanges(paths, operations);
    await collectLogs(paths, state);
    await pruneOwnLogs(state);
    await withSyncLock(paths, async () => {
      const current = await readState(paths);
      current.lastSyncAt = new Date().toISOString();
      current.error = undefined;
      await saveState(paths, current);
    });
    if (imported > 0 && paths === defaultPaths) {
      await reloadHotkeys().catch(() => {});
      await reloadSnippets();
    }
  } catch (error) {
    await withSyncLock(paths, async () => {
      const state = await readState(paths);
      state.error = error instanceof Error ? error.message : String(error);
      await saveState(paths, state);
    });
    throw error;
  } finally {
    if (staging !== undefined) await rm(staging, { recursive: true, force: true });
    await rm(runLock, { recursive: true, force: true });
  }
  return readSyncStatus(paths);
};
