import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDir } from "../paths.ts";

const PENDING_DIR = join(buildDir, "pending-windows");
const REQUEST_SUFFIX = ".json";
// Longer than a slow Terminal takes to open, and short enough that a window that never opened
// can't hand its item to a search window much later.
const MAX_REQUEST_AGE_MS = 15_000;
const WINDOW_COMMANDS = new Set(["run-in-window", "update-in-window"]);

const parseRequest = (text: string): string[] | undefined => {
  const parsed: unknown = JSON.parse(text);
  const isValid =
    Array.isArray(parsed) &&
    parsed.every((part) => typeof part === "string") &&
    WINDOW_COMMANDS.has(String(parsed[0]));
  return isValid ? parsed : undefined;
};

/**
 * Leaves a note for the next Redhot window saying what to run. Every window starts the same
 * launcher, because Terminal saves a copy of a profile whenever its command changes.
 */
export const requestWindow = async (
  cliArguments: readonly string[],
  folder: string = PENDING_DIR,
  now: number = Date.now(),
): Promise<void> => {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = `${now}-${randomUUID()}`;
  const temporaryPath = join(folder, `${name}.tmp`);
  await writeFile(temporaryPath, JSON.stringify(cliArguments), { mode: 0o600 });
  await rename(temporaryPath, join(folder, `${name}${REQUEST_SUFFIX}`));
};

// Renaming first means two windows starting together can't both take the same note.
const takeRequest = async (path: string): Promise<string | undefined> => {
  const claimedPath = `${path}.${randomUUID()}.claimed`;
  try {
    await rename(path, claimedPath);
  } catch {
    return undefined;
  }
  try {
    return await readFile(claimedPath, "utf8");
  } finally {
    await rm(claimedPath, { force: true });
  }
};

/** Takes the oldest note still fresh, and clears out any that went stale. */
export const claimWindowRequest = async (
  folder: string = PENDING_DIR,
  now: number = Date.now(),
): Promise<string[] | undefined> => {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return undefined;
  }
  for (const name of names.filter((entry) => entry.endsWith(REQUEST_SUFFIX)).toSorted()) {
    const path = join(folder, name);
    const text = await takeRequest(path);
    const isFresh = now - Number.parseInt(name, 10) <= MAX_REQUEST_AGE_MS;
    if (text !== undefined && isFresh) {
      try {
        const request = parseRequest(text);
        if (request !== undefined) {
          return request;
        }
      } catch {
        // A broken note is skipped, like a stale one.
      }
    }
  }
  return undefined;
};
