import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { isObject } from "../../config.ts";
import { clipboardHistoryPath, clipboardImagesDir } from "../../paths.ts";
import { runCommand } from "../../shell.ts";

const MAX_ENTRIES = 200;
// Screenshots are far bigger than text, so fewer are kept.
const MAX_IMAGES = 50;
// Large copies are usually files or logs, and would make every read of the history slow.
const MAX_TEXT_LENGTH = 100_000;
const MAX_IMAGE_BYTES = 30_000_000;
// Only this user may read these, because copied content can be private.
const OWNER_ONLY_FILE = 0o600;
const OWNER_ONLY_FOLDER = 0o700;
const HASH_LENGTH = 32;
// Big enough for the largest preview pane, and small enough to read on every arrow key.
const THUMBNAIL_SIZE = "96";
const PNG_SIGNATURE = "89504e470d0a1a0a";
const PNG_WIDTH_POSITION = 16;
const PNG_HEIGHT_POSITION = 20;
const PNG_HEADER_LENGTH = 24;

export interface TextEntry {
  kind: "text";
  id: string;
  text: string;
  copiedAt: number;
}

export interface ImageEntry {
  kind: "image";
  id: string;
  hash: string;
  width: number;
  height: number;
  bytes: number;
  copiedAt: number;
}

export type ClipboardEntry = TextEntry | ImageEntry;

const toEntry = (value: unknown): ClipboardEntry | undefined => {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.copiedAt !== "number") {
    return undefined;
  }
  const { id, copiedAt, text, hash, width, height, bytes } = value;
  if (typeof text === "string") {
    return { kind: "text", id, text, copiedAt };
  }
  const isImage =
    typeof hash === "string" &&
    typeof width === "number" &&
    typeof height === "number" &&
    typeof bytes === "number";
  return isImage ? { kind: "image", id, hash, width, height, bytes, copiedAt } : undefined;
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
  } catch {
    return [];
  }
};

export const getImagePath = (hash: string): string => join(clipboardImagesDir, `${hash}.png`);
export const getThumbnailPath = (hash: string): string => join(clipboardImagesDir, `${hash}.bmp`);

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
  await writeFile(temporaryPath, JSON.stringify(entries), { mode: OWNER_ONLY_FILE });
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

const keepNewestImages = (entries: readonly ClipboardEntry[]): ClipboardEntry[] => {
  let imageCount = 0;
  return entries.filter((entry) => {
    imageCount += entry.kind === "image" ? 1 : 0;
    return entry.kind === "text" || imageCount <= MAX_IMAGES;
  });
};

/** Newest first. Copying the same thing again moves it to the top instead of adding it twice. */
export const addEntry = (
  entries: readonly ClipboardEntry[],
  entry: ClipboardEntry,
): ClipboardEntry[] => {
  if (!canRecord(entry)) {
    return [...entries];
  }
  const others = entries.filter((other) => !hasSameContent(other, entry));
  return keepNewestImages([entry, ...others]).slice(0, MAX_ENTRIES);
};

export const recordText = async (text: string): Promise<void> => {
  const entries = await readEntries();
  const entry: TextEntry = { kind: "text", id: randomUUID(), text, copiedAt: Date.now() };
  await writeEntries(addEntry(entries, entry));
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

const saveImageFiles = async (png: Buffer, hash: string): Promise<void> => {
  await mkdir(clipboardImagesDir, { recursive: true, mode: OWNER_ONLY_FOLDER });
  const imagePath = getImagePath(hash);
  const thumbnailPath = getThumbnailPath(hash);
  await writeFile(imagePath, png, { mode: OWNER_ONLY_FILE });
  try {
    const resize = ["-s", "format", "bmp", "-Z", THUMBNAIL_SIZE, imagePath, "--out", thumbnailPath];
    await runCommand("sips", resize);
    await chmod(thumbnailPath, OWNER_ONLY_FILE);
  } catch {
    // The image still works without a preview.
  }
};

export const recordImage = async (png: Buffer): Promise<void> => {
  const size = readPngSize(png);
  if (size === undefined || png.length > MAX_IMAGE_BYTES) {
    return;
  }
  const hash = createHash("sha256").update(png).digest("hex").slice(0, HASH_LENGTH);
  await saveImageFiles(png, hash);
  const entries = await readEntries();
  const entry: ImageEntry = {
    kind: "image",
    id: randomUUID(),
    hash,
    ...size,
    bytes: png.length,
    copiedAt: Date.now(),
  };
  await writeEntries(addEntry(entries, entry));
};

export const removeEntry = async (id: string): Promise<void> => {
  const entries = await readEntries();
  await writeEntries(entries.filter((entry) => entry.id !== id));
};

export const clearEntries = (): Promise<void> => writeEntries([]);
