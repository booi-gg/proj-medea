import { basename } from "node:path";
import { readConfig, updateConfig } from "../config.ts";
import type { AliasMap } from "../config.ts";

const COMMAND_PREFIX = "command:";
const WHITESPACE = /\s/;

/** Turns "Code, IDE" into ["code", "ide"]. */
export const parseAliasInput = (input: string): string[] => {
  const aliases = input
    .split(",")
    .map((alias) => alias.trim().toLowerCase())
    .filter((alias) => alias !== "");
  return [...new Set(aliases)];
};

const toDisplayName = (itemValue: string): string =>
  itemValue.startsWith(COMMAND_PREFIX)
    ? itemValue.slice(COMMAND_PREFIX.length)
    : basename(itemValue, ".app");

/** Returns what is wrong with these aliases, or undefined when they can be saved. */
export const findAliasProblem = (
  aliases: readonly string[],
  itemValue: string,
  allAliases: AliasMap,
): string | undefined => {
  const withSpace = aliases.find((alias) => WHITESPACE.test(alias));
  if (withSpace !== undefined) {
    return `"${withSpace}" can't contain spaces`;
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
