import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { configPath, logDir } from "./paths.ts";
import { rotateLogs, withAction } from "./log.ts";
import { withStorageLock, writeAtomic } from "./storage.ts";

export type AliasMap = Record<string, string[]>;
export type HotkeyMap = Record<string, string>;

export const HISTORY_MONTH_CHOICES = [3, 4, 5, 12] as const;
export type HistoryMonths = (typeof HISTORY_MONTH_CHOICES)[number];
export const DEFAULT_HISTORY_MONTHS: HistoryMonths = 3;
export const LOG_SIZE_CHOICES = [10, 50, 100, 500] as const;
export type LogMaxSizeMb = (typeof LOG_SIZE_CHOICES)[number];
export const DEFAULT_LOG_MAX_SIZE_MB: LogMaxSizeMb = 50;

export interface Config {
  terminal?: string;
  aliases: AliasMap;
  hotkeys: HotkeyMap;
  clipboardHistoryMonths?: HistoryMonths;
  logMaxSizeMb?: LogMaxSizeMb;
}

const EMPTY_CONFIG: Config = { aliases: {}, hotkeys: {} };

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const parseAliasMap = (value: unknown): AliasMap => {
  if (!isObject(value)) {
    return {};
  }
  const aliases: AliasMap = {};
  for (const [key, list] of Object.entries(value)) {
    if (isStringList(list)) {
      aliases[key] = list;
    }
  }
  return aliases;
};

const parseHotkeyMap = (value: unknown): HotkeyMap => {
  if (!isObject(value)) {
    return {};
  }
  const hotkeys: HotkeyMap = {};
  for (const [key, hotkey] of Object.entries(value)) {
    if (typeof hotkey === "string") {
      hotkeys[key] = hotkey;
    }
  }
  return hotkeys;
};

const toHistoryMonths = (value: unknown): HistoryMonths | undefined =>
  HISTORY_MONTH_CHOICES.find((months) => months === value);
const toLogMaxSizeMb = (value: unknown): LogMaxSizeMb | undefined =>
  LOG_SIZE_CHOICES.find((size) => size === value);

/** Broken or missing settings read as empty, so a bad file can't stop the app. */
export const parseConfig = (configText: string): Config => {
  try {
    const parsed: unknown = JSON.parse(configText);
    if (!isObject(parsed)) {
      return EMPTY_CONFIG;
    }
    const terminal = typeof parsed.terminal === "string" ? parsed.terminal : undefined;
    const clipboardHistoryMonths = toHistoryMonths(parsed.clipboardHistoryMonths);
    const logMaxSizeMb = toLogMaxSizeMb(parsed.logMaxSizeMb);
    return {
      terminal,
      aliases: parseAliasMap(parsed.aliases),
      hotkeys: parseHotkeyMap(parsed.hotkeys),
      ...(clipboardHistoryMonths === undefined ? {} : { clipboardHistoryMonths }),
      ...(logMaxSizeMb === undefined ? {} : { logMaxSizeMb }),
    };
  } catch {
    return EMPTY_CONFIG;
  }
};

export const readConfig = async (): Promise<Config> => {
  try {
    return parseConfig(await readFile(configPath, "utf8"));
  } catch {
    return EMPTY_CONFIG;
  }
};

/** Synchronous so the search prompt can pick up new aliases on each keystroke. */
export const readConfigSync = (): Config => {
  try {
    return parseConfig(readFileSync(configPath, "utf8"));
  } catch {
    return EMPTY_CONFIG;
  }
};

/** Merges into the saved settings, so changing one setting never wipes another. */
export const updateConfig = async (changes: Partial<Config>): Promise<void> => {
  await withAction("config.update", { count: Object.keys(changes).length }, async () => {
    await withStorageLock(async () => {
      const merged = { ...(await readConfig()), ...changes };
      await writeAtomic(configPath, `${JSON.stringify(merged, null, 2)}\n`);
    });
    if (changes.logMaxSizeMb !== undefined) {
      rotateLogs(process.env.MEDEA_LOG_DIR ?? logDir, changes.logMaxSizeMb, true);
    }
  });
};
