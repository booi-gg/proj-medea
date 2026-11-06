import { homedir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../../shell.ts";
import { MAX_ARGUMENTS, findArguments, hasUrlScheme } from "./placeholders.ts";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$)/;
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]|$)/;
const VALID_START = /^[/~{]/;
const HOME_PREFIX = "~/";

/** "github.com" becomes "https://github.com", so people can type links the way they say them. */
export const normalizeLink = (input: string): string => {
  const link = input.trim();
  if (LOCAL_HOST.test(link)) {
    return `http://${link}`;
  }
  return BARE_DOMAIN.test(link) ? `https://${link}` : link;
};

/** Returns what is wrong with this link, or undefined when it can be saved. */
export const findLinkProblem = (input: string): string | undefined => {
  const link = normalizeLink(input);
  if (link === "") {
    return "Enter a link";
  }
  if (!hasUrlScheme(link) && !VALID_START.test(link)) {
    return "Use a URL like https://github.com, or a path like ~/Documents";
  }
  return findArguments(link).length > MAX_ARGUMENTS
    ? `Use at most ${MAX_ARGUMENTS} arguments`
    : undefined;
};

export const expandHome = (target: string, homeDir: string): string => {
  if (target === "~") {
    return homeDir;
  }
  return target.startsWith(HOME_PREFIX) ? join(homeDir, target.slice(HOME_PREFIX.length)) : target;
};

export const toOpenArguments = (target: string, openWith: string | undefined): string[] =>
  openWith === undefined ? [target] : ["-a", openWith, target];

export const readClipboard = async (): Promise<string> => {
  const { stdout } = await runCommand("pbpaste");
  return stdout.trim();
};

export const openTarget = async (filledLink: string, openWith?: string): Promise<void> => {
  const target = expandHome(filledLink.trim(), homedir());
  // An argument can fill the whole link, and "open" would read this one as a flag.
  if (target === "" || target.startsWith("-")) {
    throw new Error(`Could not open "${target}"`);
  }
  try {
    await runCommand("open", toOpenArguments(target, openWith));
  } catch (error) {
    throw new Error(`Could not open ${target}`, { cause: error });
  }
};
