import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { configPath } from "./paths.ts";

export type AliasMap = Record<string, string[]>;

export interface Config {
  terminal?: string;
  aliases: AliasMap;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
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

/** Broken or missing settings read as empty, so a bad file can't stop the app. */
export const parseConfig = (configText: string): Config => {
  try {
    const parsed: unknown = JSON.parse(configText);
    if (!isObject(parsed)) {
      return { aliases: {} };
    }
    const terminal = typeof parsed.terminal === "string" ? parsed.terminal : undefined;
    return { terminal, aliases: parseAliasMap(parsed.aliases) };
  } catch {
    return { aliases: {} };
  }
};

export const readConfig = async (): Promise<Config> => {
  try {
    return parseConfig(await readFile(configPath, "utf8"));
  } catch {
    return { aliases: {} };
  }
};

/** Synchronous so the search prompt can pick up new aliases on each keystroke. */
export const readConfigSync = (): Config => {
  try {
    return parseConfig(readFileSync(configPath, "utf8"));
  } catch {
    return { aliases: {} };
  }
};

/** Merges into the saved settings, so changing one setting never wipes another. */
export const updateConfig = async (changes: Partial<Config>): Promise<void> => {
  const merged = { ...(await readConfig()), ...changes };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`);
};
