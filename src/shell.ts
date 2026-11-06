import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const runCommand = promisify(execFile);

export const quoteForShell = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;
