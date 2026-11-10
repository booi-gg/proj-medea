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
export const WEB_SEARCH_ENGINE_CHOICES = ["google", "duckduckgo", "kagi"] as const;
export type WebSearchEngine = (typeof WEB_SEARCH_ENGINE_CHOICES)[number];
export const DEFAULT_WEB_SEARCH_ENGINE: WebSearchEngine = "google";
/** The shortcut that opens Redhot from anywhere, until it's changed in Settings. */
export const DEFAULT_LAUNCH_HOTKEY = "shift+cmd+space";
export const DEFAULT_DEFINE_PHRASES: readonly string[] = [
  "define",
  "definition of",
  "meaning of",
  "what is",
  "what's",
  "what is the meaning of",
  "what's the meaning of",
];

export interface Config {
  aliases: AliasMap;
  hotkeys: HotkeyMap;
  clipboardHistoryMonths?: HistoryMonths;
  logMaxSizeMb?: LogMaxSizeMb;
  checkForUpdates?: boolean;
  webSearchEngine?: WebSearchEngine;
  /** Off unless it's been turned on. */
  recentProjects?: boolean;
  /** Off unless it's been turned on. */
  browserBookmarks?: boolean;
  /** What's typed before a word to define it. Missing means the defaults, and empty means none. */
  definePhrases?: string[];
  /** The shortcut that opens Redhot. Missing means DEFAULT_LAUNCH_HOTKEY. */
  launchHotkey?: string;
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
const toWebSearchEngine = (value: unknown): WebSearchEngine | undefined =>
  WEB_SEARCH_ENGINE_CHOICES.find((engine) => engine === value);

/** Broken or missing settings read as empty, so a bad file can't stop the app. */
export const parseConfig = (configText: string): Config => {
  try {
    const parsed: unknown = JSON.parse(configText);
    if (!isObject(parsed)) {
      return EMPTY_CONFIG;
    }
    const clipboardHistoryMonths = toHistoryMonths(parsed.clipboardHistoryMonths);
    const logMaxSizeMb = toLogMaxSizeMb(parsed.logMaxSizeMb);
    const webSearchEngine = toWebSearchEngine(parsed.webSearchEngine);
    const { checkForUpdates, recentProjects, browserBookmarks, definePhrases, launchHotkey } =
      parsed;
    return {
      aliases: parseAliasMap(parsed.aliases),
      hotkeys: parseHotkeyMap(parsed.hotkeys),
      ...(clipboardHistoryMonths === undefined ? {} : { clipboardHistoryMonths }),
      ...(logMaxSizeMb === undefined ? {} : { logMaxSizeMb }),
      ...(typeof checkForUpdates === "boolean" ? { checkForUpdates } : {}),
      ...(webSearchEngine === undefined ? {} : { webSearchEngine }),
      ...(typeof recentProjects === "boolean" ? { recentProjects } : {}),
      ...(typeof browserBookmarks === "boolean" ? { browserBookmarks } : {}),
      ...(isStringList(definePhrases) ? { definePhrases } : {}),
      ...(typeof launchHotkey === "string" ? { launchHotkey } : {}),
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
      rotateLogs(process.env.REDHOT_LOG_DIR ?? logDir, changes.logMaxSizeMb, true);
    }
  });
};
