import { setTimeout } from "node:timers/promises";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { logDir } from "./paths.ts";

const LOG_NAME = /^medea(?:\.\d{8}T\d{9}Z-\d+-[a-f0-9]+)?\.log$/;
const TRACE_ID = /^[a-f0-9-]{6,64}$/i;
const READ_BYTES = 64 * 1024;
const FOLLOW_INTERVAL_MS = 350;

interface ReadState {
  offset: number;
  remainder: string;
}

interface LogRow {
  ts?: unknown;
  level?: unknown;
  source?: unknown;
  pid?: unknown;
  trace?: unknown;
  id?: unknown;
  parent?: unknown;
  event?: unknown;
  phase?: unknown;
  item?: unknown;
  kind?: unknown;
  program?: unknown;
  bytes?: unknown;
  childPid?: unknown;
  exitCode?: unknown;
  durationMs?: unknown;
  ok?: unknown;
  error?: unknown;
  status?: unknown;
  result?: unknown;
  reason?: unknown;
  count?: unknown;
  typeCount?: unknown;
  sourceKind?: unknown;
}

const printable = (value: unknown): string => {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return typeof value === "string" ? value.replaceAll(/[\r\n\t]/g, " ").slice(0, 96) : "";
};

const printLine = (line: string, trace: string | undefined): void => {
  try {
    const row: LogRow = JSON.parse(line);
    if (trace !== undefined && row.trace !== trace) {
      return;
    }
    const parts = [
      printable(row.ts),
      printable(row.level).toUpperCase().padEnd(5),
      printable(row.source),
      `pid=${printable(row.pid)}`,
      printable(row.event) + (row.phase ? `:${printable(row.phase)}` : ""),
    ];
    for (const key of [
      "id",
      "parent",
      "item",
      "kind",
      "program",
      "bytes",
      "childPid",
      "exitCode",
      "durationMs",
      "ok",
      "error",
      "status",
      "result",
      "reason",
      "count",
      "typeCount",
      "sourceKind",
    ] as const) {
      if (row[key] !== undefined) {
        parts.push(`${key}=${printable(row[key])}`);
      }
    }
    parts.push(`trace=${printable(row.trace)}`);
    process.stdout.write(`${parts.join(" ")}\n`);
  } catch {
    // A process may have stopped halfway through a line; the next line is still readable.
  }
};

const listLogPaths = async (directory: string): Promise<string[]> => {
  try {
    const names = (await readdir(directory)).filter((name) => LOG_NAME.test(name));
    names.sort((first, second) => {
      if (first === "medea.log") return 1;
      if (second === "medea.log") return -1;
      return first.localeCompare(second);
    });
    return names.map((name) => join(directory, name));
  } catch {
    return [];
  }
};

const readNewLines = async (
  path: string,
  state: ReadState,
  trace: string | undefined,
): Promise<void> => {
  const file = await open(path, "r");
  try {
    const size = (await file.stat()).size;
    if (size < state.offset) {
      state.offset = 0;
      state.remainder = "";
    }
    const buffer = Buffer.allocUnsafe(READ_BYTES);
    while (state.offset < size) {
      const { bytesRead } = await file.read(
        buffer,
        0,
        Math.min(READ_BYTES, size - state.offset),
        state.offset,
      );
      if (bytesRead === 0) break;
      state.offset += bytesRead;
      const text = state.remainder + buffer.toString("utf8", 0, bytesRead);
      const lines = text.split("\n");
      state.remainder = lines.pop() ?? "";
      for (const line of lines) {
        printLine(line, trace);
      }
    }
  } finally {
    await file.close();
  }
};

export const showLogs = async (args: string[]): Promise<void> => {
  let follow = false;
  let trace: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--follow") {
      follow = true;
    } else if (argument === "--trace" && TRACE_ID.test(args[index + 1] ?? "")) {
      trace = args[index + 1];
      index += 1;
    } else {
      throw new Error("Usage: medea logs [--follow] [--trace <id>]");
    }
  }
  const directory = process.env.MEDEA_LOG_DIR ?? logDir;
  const states = new Map<string, ReadState>();
  do {
    const current = new Set<string>();
    for (const path of await listLogPaths(directory)) {
      try {
        const info = await stat(path);
        const key = `${info.dev}:${info.ino}`;
        current.add(key);
        const state = states.get(key) ?? { offset: 0, remainder: "" };
        await readNewLines(path, state, trace);
        states.set(key, state);
      } catch {
        // Rotation or pruning may remove a file between listing and opening it.
      }
    }
    for (const key of states.keys()) {
      if (!current.has(key)) states.delete(key);
    }
    if (follow) await setTimeout(FOLLOW_INTERVAL_MS);
  } while (follow);
};
