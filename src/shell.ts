import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runCommand = promisify(execFile);

// pbcopy and pbpaste garble non-English text without this, and the helper's locale can be empty.
export const UTF8_ENVIRONMENT = { ...process.env, LC_CTYPE: "UTF-8" };

export const quoteForShell = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

export const getOwnTtyPath = async (): Promise<string> => {
  const { stdout } = await runCommand("ps", ["-o", "tty=", "-p", String(process.pid)]);
  return `/dev/${stdout.trim()}`;
};
