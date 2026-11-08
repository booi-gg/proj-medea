import { createHash, randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, parse } from "node:path";
import { DEFAULT_HISTORY_MONTHS, isObject, readConfig } from "../../config.ts";
import type { HistoryMonths } from "../../config.ts";
import { clipboardHistoryPath, clipboardImagesDir } from "../../paths.ts";
import { withAction, writeLog } from "../../log.ts";
import { toPreview } from "./format.ts";

// History ends by age. These only stop heavy use from filling the disk or slowing every copy,
// because each copy reads and saves the whole list.
const MAX_ENTRIES = 5000;
const MAX_TOTAL_TEXT_LENGTH = 20_000_000;
const MAX_TOTAL_IMAGE_BYTES = 2_000_000_000;
// Large copies are usually files or logs, and would make every read of the history slow.
const MAX_TEXT_LENGTH = 100_000;
const MAX_IMAGE_BYTES = 30_000_000;
const MAX_IMAGE_NAME_WIDTH = 200;
// Only this user may read these, because copied content can be private.
const OWNER_ONLY_FILE = 0o600;
const OWNER_ONLY_FOLDER = 0o700;
const HASH_LENGTH = 32;
const PNG_SIGNATURE = "89504e470d0a1a0a";
const PNG_WIDTH_POSITION = 16;
const PNG_HEIGHT_POSITION = 20;
const PNG_HEADER_LENGTH = 24;

export interface TextEntry {
  kind: "text";
  id: string;
  text: string;
  copiedAt: number;
  pinned?: boolean;
}

export interface ImageEntry {
  kind: "image";
  id: string;
  hash: string;
  width: number;
  height: number;
  bytes: number;
  copiedAt: number;
  /** The file's name. A screenshot is only pixels, so it doesn't have one. */
  name?: string;
  pinned?: boolean;
}

export type ClipboardEntry = TextEntry | ImageEntry;

const toEntry = (value: unknown): ClipboardEntry | undefined => {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.copiedAt !== "number") {
    return undefined;
  }
  const { id, copiedAt, text, hash, width, height, bytes, name, pinned } = value;
  const pin = pinned === true ? { pinned } : {};
  if (typeof text === "string") {
    return { kind: "text", id, text, copiedAt, ...pin };
  }
  const isImage =
    typeof hash === "string" &&
    typeof width === "number" &&
    typeof height === "number" &&
    typeof bytes === "number";
  if (!isImage) {
    return undefined;
  }
  const image: ImageEntry = {
    kind: "image",
    id,
    hash,
    width,
    height,
    bytes,
    copiedAt,
    ...pin,
  };
  return typeof name === "string" ? { ...image, name } : image;
};

/** Broken or missing history reads as empty. It is a convenience, so it can start over. */
export const parseEntries = (fileText: string): ClipboardEntry[] => {
  try {
    const parsed: unknown = JSON.parse(fileText);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(toEntry).filter((entry) => entry !== undefined);
  } catch {
    return [];
  }
};

export const readEntries = async (): Promise<ClipboardEntry[]> => {
  try {
    return parseEntries(await readFile(clipboardHistoryPath, "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      writeLog("clipboard.read-failed", { error }, { level: "warn" });
    }
    return [];
  }
};

/** Calls back when history changes. It watches the folder, because saving replaces the file. */
export const watchEntries = (onChange: () => void): (() => void) => {
  const watcher = watch(dirname(clipboardHistoryPath), (_event, fileName) => {
    if (fileName === basename(clipboardHistoryPath)) {
      onChange();
    }
  });
  return () => {
    watcher.close();
  };
};

export const getImagePath = (hash: string): string => join(clipboardImagesDir, `${hash}.png`);

// Files are named after their image, so anything no entry mentions can go.
const removeUnusedImages = async (entries: readonly ClipboardEntry[]): Promise<void> => {
  const usedHashes = new Set(
    entries.flatMap((entry) => (entry.kind === "image" ? entry.hash : [])),
  );
  const files = await readdir(clipboardImagesDir).catch(() => []);
  const unused = files.filter((file) => !usedHashes.has(parse(file).name));
  await Promise.all(unused.map((file) => rm(join(clipboardImagesDir, file), { force: true })));
};

// Writes then renames, so a reader never sees half a file.
const writeEntries = async (entries: readonly ClipboardEntry[]): Promise<void> => {
  await mkdir(dirname(clipboardHistoryPath), { recursive: true });
  const temporaryPath = `${clipboardHistoryPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(entries), {
    mode: OWNER_ONLY_FILE,
  });
  await rename(temporaryPath, clipboardHistoryPath);
  await removeUnusedImages(entries);
};

const canRecord = (entry: ClipboardEntry): boolean =>
  entry.kind === "image" || (entry.text.trim() !== "" && entry.text.length <= MAX_TEXT_LENGTH);

const hasSameContent = (first: ClipboardEntry, second: ClipboardEntry): boolean => {
  if (first.kind === "text" && second.kind === "text") {
    return first.text === second.text;
  }
  return first.kind === "image" && second.kind === "image" && first.hash === second.hash;
};

const isPinned = (entry: ClipboardEntry): boolean => entry.pinned === true;

/** Pinned entries, then the rest, each still newest first. */
export const pinnedFirst = (entries: readonly ClipboardEntry[]): ClipboardEntry[] => [
  ...entries.filter(isPinned),
  ...entries.filter((entry) => !isPinned(entry)),
];

// Pins are counted first, so an old pin only goes if pins alone are over a limit.
const keepWithinLimits = (entries: readonly ClipboardEntry[]): ClipboardEntry[] => {
  let textLength = 0;
  let imageBytes = 0;
  const fitting = pinnedFirst(entries).filter((entry) => {
    if (entry.kind === "text") {
      textLength += entry.text.length;
      return textLength <= MAX_TOTAL_TEXT_LENGTH;
    }
    imageBytes += entry.bytes;
    return imageBytes <= MAX_TOTAL_IMAGE_BYTES;
  });
  const kept = new Set(fitting.slice(0, MAX_ENTRIES));
  return entries.filter((entry) => kept.has(entry));
};

// Copying an image back out of Redhot leaves only its pixels, which must not lose the name it had.
const keepKnownName = (
  entry: ClipboardEntry,
  others: readonly ClipboardEntry[],
): ClipboardEntry => {
  if (entry.kind !== "image" || entry.name !== undefined) {
    return entry;
  }
  const known = others.find((other) => hasSameContent(other, entry));
  return known?.kind === "image" && known.name !== undefined
    ? { ...entry, name: known.name }
    : entry;
};

// Enter copies an entry back, which records it again and must not unpin it.
const keepKnownPin = (entry: ClipboardEntry, others: readonly ClipboardEntry[]): ClipboardEntry =>
  others.some((other) => isPinned(other) && hasSameContent(other, entry))
    ? { ...entry, pinned: true }
    : entry;

/** Newest first. Copying the same thing again moves it to the top instead of adding it twice. */
export const addEntry = (
  entries: readonly ClipboardEntry[],
  entry: ClipboardEntry,
): ClipboardEntry[] => {
  if (!canRecord(entry)) {
    return [...entries];
  }
  const others = entries.filter((other) => !hasSameContent(other, entry));
  return keepWithinLimits([keepKnownPin(keepKnownName(entry, entries), entries), ...others]);
};

/** Pins the entry with this id, or unpins it if it's already pinned. */
export const togglePinned = (entries: readonly ClipboardEntry[], id: string): ClipboardEntry[] =>
  entries.map((entry) => (entry.id === id ? { ...entry, pinned: !isPinned(entry) } : entry));

/** Pinned entries, and any others copied within the last `months`, counted in calendar months. */
export const keepRecentEntries = (
  entries: readonly ClipboardEntry[],
  months: HistoryMonths,
  now: number,
): ClipboardEntry[] => {
  const oldestAllowed = new Date(now);
  oldestAllowed.setMonth(oldestAllowed.getMonth() - months);
  return entries.filter((entry) => isPinned(entry) || entry.copiedAt >= oldestAllowed.getTime());
};

const readHistoryMonths = async (): Promise<HistoryMonths> => {
  const { clipboardHistoryMonths } = await readConfig();
  return clipboardHistoryMonths ?? DEFAULT_HISTORY_MONTHS;
};

const saveEntry = async (entry: ClipboardEntry): Promise<void> => {
  const [entries, months] = await Promise.all([readEntries(), readHistoryMonths()]);
  await writeEntries(addEntry(keepRecentEntries(entries, months, Date.now()), entry));
};

/** How many entries a shorter history would delete, so that can be asked about first. */
export const countEntriesToRemove = async (months: HistoryMonths): Promise<number> => {
  const entries = await readEntries();
  return entries.length - keepRecentEntries(entries, months, Date.now()).length;
};

/** Nothing else removes old entries when you aren't copying, so this runs when history is opened. */
export const removeExpiredEntries = async (): Promise<void> => {
  await withAction("clipboard.prune", {}, async () => {
    const [entries, months] = await Promise.all([readEntries(), readHistoryMonths()]);
    const recent = keepRecentEntries(entries, months, Date.now());
    if (recent.length < entries.length) {
      await writeEntries(recent);
    }
  });
};

export const recordText = async (text: string): Promise<void> => {
  await withAction(
    "clipboard.record",
    { kind: "text", bytes: Buffer.byteLength(text) },
    async () => {
      await saveEntry({
        kind: "text",
        id: randomUUID(),
        text,
        copiedAt: Date.now(),
      });
    },
  );
};

/** Reads the size from the start of a PNG. Returns undefined for anything else. */
export const readPngSize = (png: Buffer): { width: number; height: number } | undefined => {
  if (png.length < PNG_HEADER_LENGTH || png.toString("hex", 0, 8) !== PNG_SIGNATURE) {
    return undefined;
  }
  return {
    width: png.readUInt32BE(PNG_WIDTH_POSITION),
    height: png.readUInt32BE(PNG_HEIGHT_POSITION),
  };
};

/** A file name can hold escape codes, and it ends up on screen. Blank means there isn't one. */
export const toImageName = (name: string | undefined): string | undefined =>
  toPreview(name ?? "", MAX_IMAGE_NAME_WIDTH) || undefined;

export const recordImage = async (png: Buffer, copiedName?: string): Promise<void> => {
  const size = readPngSize(png);
  if (size === undefined || png.length > MAX_IMAGE_BYTES) {
    writeLog("clipboard.skip", { kind: "image", bytes: png.length });
    return;
  }
  await withAction("clipboard.record", { kind: "image", bytes: png.length }, async () => {
    const hash = createHash("sha256").update(png).digest("hex").slice(0, HASH_LENGTH);
    await mkdir(clipboardImagesDir, {
      recursive: true,
      mode: OWNER_ONLY_FOLDER,
    });
    await writeFile(getImagePath(hash), png, { mode: OWNER_ONLY_FILE });
    const name = toImageName(copiedName);
    await saveEntry({
      kind: "image",
      id: randomUUID(),
      hash,
      ...size,
      bytes: png.length,
      copiedAt: Date.now(),
      ...(name === undefined ? {} : { name }),
    });
  });
};

export const removeEntry = async (id: string): Promise<void> => {
  await withAction("clipboard.remove", {}, async () => {
    const entries = await readEntries();
    await writeEntries(entries.filter((entry) => entry.id !== id));
  });
};

export const toggleEntryPin = async (id: string): Promise<void> => {
  await withAction("clipboard.pin", {}, async () => {
    await writeEntries(togglePinned(await readEntries(), id));
  });
};

export const clearEntries = (): Promise<void> =>
  withAction("clipboard.clear", {}, () => writeEntries([]));
