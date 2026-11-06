import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";

export const runCommand = promisify(execFile);

// pbcopy and pbpaste garble non-English text without this, and the helper's locale can be empty.
export const UTF8_ENVIRONMENT = { ...process.env, LC_CTYPE: "UTF-8" };

export const copyText = async (text: string): Promise<void> => {
  const copier = spawn("pbcopy", { env: UTF8_ENVIRONMENT, stdio: ["pipe", "ignore", "ignore"] });
  copier.stdin.end(text);
  const [exitCode] = await once(copier, "close");
  if (exitCode !== 0) {
    throw new Error("Could not copy that to the clipboard");
  }
};

export const quoteForShell = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

export const getOwnTtyPath = async (): Promise<string> => {
  const { stdout } = await runCommand("ps", ["-o", "tty=", "-p", String(process.pid)]);
  return `/dev/${stdout.trim()}`;
};
