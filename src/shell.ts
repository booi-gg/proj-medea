import { execFile, spawn } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { endAction, startAction, trackSpawn } from "./log.ts";

const execFileAsync = promisify(execFile);
// These exit with 1 to say they found nothing, which isn't a failure worth logging as one.
const NO_MATCH_PROGRAMS: ReadonlySet<string> = new Set(["pgrep", "lsof", "ps"]);
const AUTOMATION_DENIED = "-1743";

/** Logs the program and exit state, never arguments or output. */
export const runCommand = async (
  file: string,
  argsOrOptions?: readonly string[] | ExecFileOptions,
  options?: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> => {
  const action = startAction("process.exec", { program: file });
  try {
    const result = Array.isArray(argsOrOptions)
      ? await execFileAsync(file, [...argsOrOptions], options)
      : argsOrOptions === undefined
        ? await execFileAsync(file)
        : await execFileAsync(file, argsOrOptions as ExecFileOptions);
    endAction(action, true);
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (error) {
    const isNoMatch =
      NO_MATCH_PROGRAMS.has(file) && error instanceof Error && "code" in error && error.code === 1;
    endAction(
      action,
      isNoMatch,
      isNoMatch ? undefined : error,
      isNoMatch ? { kind: "no-match" } : {},
    );
    throw error;
  }
};

/** True when macOS refused an AppleScript because Automation permission hasn't been given. */
export const isAutomationDenied = (error: unknown): boolean =>
  error instanceof Error && "stderr" in error && String(error.stderr).includes(AUTOMATION_DENIED);

// pbcopy and pbpaste garble non-English text without this, and the helper's locale can be empty.
export const UTF8_ENVIRONMENT = { ...process.env, LC_CTYPE: "UTF-8" };

export const copyText = async (text: string): Promise<void> => {
  const copier = trackSpawn(
    spawn("pbcopy", { env: UTF8_ENVIRONMENT, stdio: ["pipe", "ignore", "ignore"] }),
    "pbcopy",
  );
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
