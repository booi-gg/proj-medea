import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { dirname, join } from "node:path";
import { configDir } from "./paths.ts";

const LOCK_WAIT_MS = 40;
const LOCK_ATTEMPTS = 250;
const STALE_LOCK_MS = 60_000;

export const writeAtomic = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const readTextIfPresent = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

/** Shared by local edits and imports so one process cannot overwrite another's update. */
export const withStorageLock = async <Result>(
  run: () => Promise<Result>,
  directory = configDir,
): Promise<Result> => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, ".storage-lock");
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      await mkdir(lockPath);
      try {
        return await run();
      } finally {
        await rm(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > STALE_LOCK_MS) {
          await rm(lockPath, { recursive: true, force: true });
        }
      } catch {
        // A different process may have released the lock between checks.
      }
      await setTimeout(LOCK_WAIT_MS);
    }
  }
  throw new Error("Medea storage is busy. Try again in a moment.");
};
