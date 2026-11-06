import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runCommand = promisify(execFile);

export const quoteForShell = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

export const getOwnTtyPath = async (): Promise<string> => {
  const { stdout } = await runCommand("ps", ["-o", "tty=", "-p", String(process.pid)]);
  return `/dev/${stdout.trim()}`;
};
