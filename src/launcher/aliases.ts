import { basename } from "node:path";
import { readConfig, updateConfig } from "../config.ts";
import type { AliasMap } from "../config.ts";

export const MAX_ALIASES = 2;
// Two aliases this long still fit beside a long app name in the launcher's title column.
const MAX_ALIAS_LENGTH = 8;
const APP_PATH_START = "/";
const WHITESPACE = /\s/;

/** Turns "Code, IDE" into ["code", "ide"]. */
export const parseAliasInput = (input: string): string[] => {
  const aliases = input
    .split(",")
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias !== "");
  return [...new Set(aliases)];
};

/** Apps are saved by path, everything else as "kind:id". */
export const toDisplayName = (itemValue: string): string =>
  itemValue.startsWith(APP_PATH_START)
    ? basename(itemValue, ".app")
    : itemValue.slice(itemValue.indexOf(":") + 1);

/** Returns what is wrong with these aliases, or undefined when they can be saved. */
export const findAliasProblem = (
  aliases: readonly string[],
  itemValue: string,
  allAliases: AliasMap,
): string | undefined => {
  if (aliases.length > MAX_ALIASES) {
    return `Use at most ${MAX_ALIASES} aliases`;
  }
  const withSpace = aliases.find((alias) => WHITESPACE.test(alias));
  if (withSpace !== undefined) {
    return `"${withSpace}" can't contain spaces`;
  }
  const tooLong = aliases.find((alias) => alias.length > MAX_ALIAS_LENGTH);
  if (tooLong !== undefined) {
    return `"${tooLong}" is too long, use ${MAX_ALIAS_LENGTH} characters or fewer`;
  }
  for (const [otherValue, otherAliases] of Object.entries(allAliases)) {
    const taken = aliases.find((alias) => otherAliases.includes(alias));
    if (otherValue !== itemValue && taken !== undefined) {
      return `"${taken}" is already used by ${toDisplayName(otherValue)}`;
    }
  }
  return undefined;
};

export const saveAliases = async (itemValue: string, aliases: string[]): Promise<void> => {
  const { aliases: current } = await readConfig();
  const { [itemValue]: _previous, ...others } = current;
  await updateConfig({
    aliases: aliases.length > 0 ? { ...others, [itemValue]: aliases } : others,
  });
};
