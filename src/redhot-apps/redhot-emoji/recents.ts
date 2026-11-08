import { readFileSync } from "node:fs";
import { writeLog } from "../../log.ts";
import { emojiRecentsPath } from "../../paths.ts";
import { withStorageLock, writeAtomic } from "../../storage.ts";

const MAX_RECENTS = 24;

/** The newest pick goes first, and picking one again moves it rather than adding a second. */
export const addRecent = (recents: readonly string[], character: string): string[] =>
  [character, ...recents.filter((recent) => recent !== character)].slice(0, MAX_RECENTS);

/** Anything in the file that isn't a list of text is ignored. */
export const parseRecents = (fileText: string): string[] => {
  const parsed: unknown = JSON.parse(fileText);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
};

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const readRecentsSync = (): string[] => {
  try {
    return parseRecents(readFileSync(emojiRecentsPath, "utf8"));
  } catch (error) {
    if (!isMissingFileError(error)) {
      writeLog("emoji.recents-read-failed", { error }, { level: "warn" });
    }
    return [];
  }
};

/** The emoji is already on the clipboard by now, so a failed save must not look like a failed copy. */
export const rememberPick = async (character: string): Promise<void> => {
  try {
    await withStorageLock(async () => {
      const recents = addRecent(readRecentsSync(), character);
      await writeAtomic(emojiRecentsPath, `${JSON.stringify(recents)}\n`);
    });
  } catch (error) {
    writeLog("emoji.recents-save-failed", { error }, { level: "warn" });
  }
};
