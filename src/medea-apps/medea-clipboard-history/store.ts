import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isObject } from "../../config.ts";
import { clipboardHistoryPath } from "../../paths.ts";

const MAX_ENTRIES = 200;
// Large copies are usually files or logs, and would make every read of the history slow.
const MAX_TEXT_LENGTH = 100_000;
// Only this user may read the file, because copied text can be private.
const OWNER_ONLY = 0o600;

export interface ClipboardEntry {
  id: string;
  text: string;
  copiedAt: number;
}

const isEntry = (value: unknown): value is ClipboardEntry =>
  isObject(value) &&
  typeof value.id === "string" &&
  typeof value.text === "string" &&
  typeof value.copiedAt === "number";

/** Broken or missing history reads as empty. It is a convenience, so it can start over. */
export const parseEntries = (fileText: string): ClipboardEntry[] => {
  try {
    const parsed: unknown = JSON.parse(fileText);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
};

export const readEntries = async (): Promise<ClipboardEntry[]> => {
  try {
    return parseEntries(await readFile(clipboardHistoryPath, "utf8"));
  } catch {
    return [];
  }
};

// Writes then renames, so a reader never sees half a file.
const writeEntries = async (entries: readonly ClipboardEntry[]): Promise<void> => {
  await mkdir(dirname(clipboardHistoryPath), { recursive: true });
  const temporaryPath = `${clipboardHistoryPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(entries), { mode: OWNER_ONLY });
  await rename(temporaryPath, clipboardHistoryPath);
};

const canRecord = (text: string): boolean => text.trim() !== "" && text.length <= MAX_TEXT_LENGTH;

/** Newest first. Copying the same text again moves it to the top instead of adding it twice. */
export const addEntry = (
  entries: readonly ClipboardEntry[],
  text: string,
  copiedAt: number,
  id: string,
): ClipboardEntry[] => {
  if (!canRecord(text)) {
    return [...entries];
  }
  const others = entries.filter((entry) => entry.text !== text);
  return [{ id, text, copiedAt }, ...others].slice(0, MAX_ENTRIES);
};

export const recordText = async (text: string): Promise<void> => {
  const entries = await readEntries();
  await writeEntries(addEntry(entries, text, Date.now(), randomUUID()));
};

export const removeEntry = async (id: string): Promise<void> => {
  const entries = await readEntries();
  await writeEntries(entries.filter((entry) => entry.id !== id));
};

export const clearEntries = (): Promise<void> => writeEntries([]);
