import { AsyncLocalStorage } from "node:async_hooks";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, join } from "node:path";
import { configPath, logDir } from "./paths.ts";

const LOG_FILE = "redhot.log";
const MEGABYTE = 1024 * 1024;
const DEFAULT_LIMIT_MB = 50;
const SIZE_CHOICES = new Set([10, 50, 100, 500]);
const SIZE_REFRESH_MS = 1000;
const MAX_LINE_BYTES = 2048;
const MAX_LABEL_LENGTH = 96;
const SAFE_LABEL = /[^a-zA-Z0-9._:-]/g;
const SAFE_ITEM = /^(?:command|redhot-[a-z-]+):[a-z0-9-]+$/i;
const SAFE_TRACE = /^[a-f0-9-]{6,64}$/i;
const SAFE_ERROR_CODES = new Set([
  "ENOENT",
  "EACCES",
  "EPERM",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTDIR",
  "EISDIR",
  "EEXIST",
  "ENOSPC",
  "EINVAL",
  "EMFILE",
  "ENFILE",
  "ENOTSUP",
  "EBUSY",
  "ENXIO",
]);
const SAFE_ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
]);
const LOG_FILE_NAME = /^redhot(?:\.\d{8}T\d{9}Z-\d+-[a-f0-9]+)?\.log$/;

export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  item?: string;
  program?: string;
  kind?: string;
  bytes?: number;
  count?: number;
  childPid?: number;
  exitCode?: number | null;
  durationMs?: number;
  interactive?: boolean;
  ok?: boolean;
  error?: unknown;
}

interface Action {
  id: string;
  parent?: string;
  trace: string;
  startedAt: number;
  event: string;
  fields: LogFields;
}

const actionContext = new AsyncLocalStorage<Action>();
const processTrace = SAFE_TRACE.test(process.env.REDHOT_TRACE ?? "")
  ? (process.env.REDHOT_TRACE ?? randomUUID())
  : randomUUID();
let cachedLimitMb = DEFAULT_LIMIT_MB;
let lastSizeRead = 0;

const safeLabel = (value: string): string =>
  value.replaceAll(SAFE_LABEL, "_").slice(0, MAX_LABEL_LENGTH);

/** Paths and arbitrary text never enter the structured log. */
export const scrubItem = (item: string | undefined): string | undefined => {
  if (item === undefined) {
    return undefined;
  }
  if (item.startsWith("/")) {
    return `app:${safeLabel(basename(item))}`;
  }
  return SAFE_ITEM.test(item) ? safeLabel(item) : "other";
};

/** Error messages can contain arguments, URLs or clipboard data, so keep only a safe code. */
export const scrubError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "unknown";
  }
  if ("code" in error && typeof error.code === "string" && SAFE_ERROR_CODES.has(error.code)) {
    return error.code;
  }
  return SAFE_ERROR_NAMES.has(error.name) ? error.name : "Error";
};

const localTimestamp = (date: Date): string => {
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes < 0 ? "-" : "+";
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetRemainder = Math.abs(offsetMinutes) % 60;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${offsetSign}${pad(offsetHours)}:${pad(offsetRemainder)}`;
};

const readLimitMb = (): number => {
  const now = Date.now();
  if (now - lastSizeRead < SIZE_REFRESH_MS) {
    return cachedLimitMb;
  }
  lastSizeRead = now;
  try {
    const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));
    cachedLimitMb = DEFAULT_LIMIT_MB;
    if (typeof config === "object" && config !== null && "logMaxSizeMb" in config) {
      const chosen = config.logMaxSizeMb;
      cachedLimitMb =
        typeof chosen === "number" && SIZE_CHOICES.has(chosen) ? chosen : DEFAULT_LIMIT_MB;
    }
  } catch {
    cachedLimitMb = DEFAULT_LIMIT_MB;
  }
  return cachedLimitMb;
};

const logFiles = (directory: string): { path: string; size: number; mtimeMs: number }[] => {
  try {
    return readdirSync(directory)
      .filter((name) => LOG_FILE_NAME.test(name))
      .flatMap((name) => {
        const path = join(directory, name);
        try {
          const file = statSync(path);
          return file.isFile() ? [{ path, size: file.size, mtimeMs: file.mtimeMs }] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
};

/** Rotates at a tenth of the total limit, then removes oldest archives to stay within it. */
export const rotateLogs = (directory: string, maxSizeMb: number, forcePrune = false): void => {
  const active = join(directory, LOG_FILE);
  const limit = maxSizeMb * MEGABYTE;
  let shouldPrune = false;
  try {
    if (statSync(active).size >= limit / 10) {
      const stamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
      renameSync(
        active,
        join(directory, `redhot.${stamp}-${process.pid}-${randomUUID().slice(0, 8)}.log`),
      );
      shouldPrune = true;
    }
  } catch {
    // Another writer may have rotated the file first.
  }
  if (!shouldPrune && !forcePrune) {
    return;
  }
  const files = logFiles(directory).sort((first, second) => first.mtimeMs - second.mtimeMs);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  // Leave room for the next active file to grow to its rotation threshold.
  const target = limit - limit / 10;
  for (const file of files) {
    if (total <= target) {
      break;
    }
    if (file.path === active) {
      continue;
    }
    try {
      unlinkSync(file.path);
      total -= file.size;
    } catch {
      // A second writer may already have removed this archive.
    }
  }
};

const toSafeFields = (fields: LogFields): Record<string, unknown> => ({
  ...(fields.item === undefined ? {} : { item: scrubItem(fields.item) }),
  ...(fields.program === undefined ? {} : { program: safeLabel(basename(fields.program)) }),
  ...(fields.kind === undefined ? {} : { kind: safeLabel(fields.kind) }),
  ...(fields.bytes === undefined ? {} : { bytes: fields.bytes }),
  ...(fields.count === undefined ? {} : { count: fields.count }),
  ...(fields.childPid === undefined ? {} : { childPid: fields.childPid }),
  ...(fields.exitCode === undefined ? {} : { exitCode: fields.exitCode }),
  ...(fields.durationMs === undefined ? {} : { durationMs: fields.durationMs }),
  ...(fields.interactive === undefined ? {} : { interactive: fields.interactive }),
  ...(fields.ok === undefined ? {} : { ok: fields.ok }),
  ...(fields.error === undefined ? {} : { error: scrubError(fields.error) }),
});

/** One append syscall per entry, so processes cannot interleave a JSON line. */
export const writeLog = (
  event: string,
  fields: LogFields = {},
  options: {
    directory?: string;
    level?: LogLevel;
    id?: string;
    parent?: string;
    trace?: string;
    phase?: "start" | "end";
  } = {},
): void => {
  try {
    const directory = options.directory ?? process.env.REDHOT_LOG_DIR ?? logDir;
    const parentAction = actionContext.getStore();
    const parentId =
      parentAction !== undefined && options.id === parentAction.id
        ? parentAction.parent
        : (options.parent ?? parentAction?.id);
    const entry = {
      ts: localTimestamp(new Date()),
      level: options.level ?? "info",
      source: "cli",
      pid: process.pid,
      ppid: process.ppid,
      trace: options.trace ?? parentAction?.trace ?? processTrace,
      id: options.id ?? randomUUID().slice(0, 12),
      ...(parentId === undefined ? {} : { parent: parentId }),
      event: safeLabel(event),
      ...(options.phase === undefined ? {} : { phase: options.phase }),
      ...toSafeFields(fields),
    };
    const line = `${JSON.stringify(entry)}\n`;
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      return;
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    rotateLogs(directory, readLimitMb());
    const descriptor = openSync(join(directory, LOG_FILE), "a", 0o600);
    try {
      writeSync(descriptor, line);
    } finally {
      closeSync(descriptor);
    }
  } catch {
    // Logging must never stop the action it describes.
  }
};

export const startAction = (event: string, fields: LogFields = {}): Action => {
  const parent = actionContext.getStore();
  const action: Action = {
    id: randomUUID().slice(0, 12),
    ...(parent === undefined ? {} : { parent: parent.id }),
    trace: parent?.trace ?? processTrace,
    startedAt: performance.now(),
    event,
    fields,
  };
  writeLog(event, fields, {
    id: action.id,
    parent: action.parent,
    trace: action.trace,
    phase: "start",
  });
  return action;
};

export const endAction = (
  action: Action,
  ok: boolean,
  error?: unknown,
  fields: LogFields = {},
): void => {
  writeLog(
    action.event,
    {
      ...action.fields,
      ...fields,
      durationMs: Math.round(performance.now() - action.startedAt),
      ok,
      ...(error === undefined ? {} : { error }),
    },
    {
      id: action.id,
      parent: action.parent,
      trace: action.trace,
      phase: "end",
      level: ok ? "info" : "warn",
    },
  );
};

export const withAction = async <Result>(
  event: string,
  fields: LogFields,
  run: () => Promise<Result>,
): Promise<Result> => {
  const action = startAction(event, fields);
  return await actionContext.run(action, async () => {
    try {
      const result = await run();
      endAction(action, true);
      return result;
    } catch (error) {
      endAction(action, false, error);
      throw error;
    }
  });
};

/** Tracks a spawned process without logging its arguments or output. */
export const trackSpawn = <Child extends ChildProcess>(child: Child, program: string): Child => {
  const action = startAction("process.spawn", { program });
  let finished = false;
  child.once("spawn", () => {
    writeLog(
      "process.spawned",
      { program, childPid: child.pid },
      { parent: action.id, trace: action.trace },
    );
  });
  child.once("error", (error) => {
    if (!finished) {
      finished = true;
      endAction(action, false, error, { childPid: child.pid });
    }
  });
  child.once("close", (exitCode, signal) => {
    if (!finished) {
      finished = true;
      endAction(action, exitCode === 0, undefined, {
        childPid: child.pid,
        exitCode,
        kind: signal ?? undefined,
      });
    }
  });
  return child;
};

export const currentTrace = (): string => actionContext.getStore()?.trace ?? processTrace;
