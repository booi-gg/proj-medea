import { readFileSync } from "node:fs";
import { writeLog } from "../../log.ts";
import { colourHistoryPath } from "../../paths.ts";
import { withStorageLock, writeAtomic } from "../../storage.ts";
import { isHexColour } from "./colour.ts";

const MAX_COLOURS = 12;

/** The newest goes first, and picking one again moves it rather than adding a second. */
export const addToHistory = (history: readonly string[], hex: string): string[] =>
  [hex, ...history.filter((saved) => saved !== hex)].slice(0, MAX_COLOURS);

/** Anything in the file that isn't a colour is ignored. */
export const parseHistory = (fileText: string): string[] => {
  const parsed: unknown = JSON.parse(fileText);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string" && isHexColour(item))
    : [];
};

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export const readHistorySync = (): string[] => {
  try {
    return parseHistory(readFileSync(colourHistoryPath, "utf8"));
  } catch (error) {
    if (!isMissingFileError(error)) {
      writeLog("colours.read-failed", { error }, { level: "warn" });
    }
    return [];
  }
};

/** A failed save loses one history entry, which is no reason to stop you copying the colour. */
export const rememberColour = async (hex: string): Promise<void> => {
  try {
    await withStorageLock(async () => {
      const history = addToHistory(readHistorySync(), hex);
      await writeAtomic(colourHistoryPath, `${JSON.stringify(history)}\n`);
    });
  } catch (error) {
    writeLog("colours.save-failed", { error }, { level: "warn" });
  }
};
