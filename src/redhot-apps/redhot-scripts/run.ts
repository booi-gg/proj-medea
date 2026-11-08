import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify, stripVTControlCharacters } from "node:util";
import { withAction } from "../../log.ts";
import { UTF8_ENVIRONMENT, runCommand } from "../../shell.ts";
import type { Script } from "./store.ts";

const execFileAsync = promisify(execFile);

// Plenty for a script's output, and a runaway one fails instead of filling memory.
const OUTPUT_LIMIT = 4 * 1024 * 1024;
// Terminal starts Redhot with the system's bare PATH, so tools from Homebrew wouldn't be found.
const EXTRA_PATH_FOLDERS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];
// A control character and "[...m": a colour code when that character is ESC.
const COLOR_SEQUENCE = /(\p{Cc}\[[0-9;]*m)/u;
const ESCAPE = "\u001B";
// Control characters other than tab and newline could move the cursor or ring the bell.
const OTHER_CONTROL_CHARACTERS = /[^\P{Cc}\n\t]/gu;
const LINE_BREAK = /\r\n|\n|\r/u;
const HOME_PREFIX = "~/";

const NOTIFY_SCRIPT = `on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run`;

export interface ScriptResult {
  stdout: string;
  stderr: string;
  failed: boolean;
}

/** The person's PATH, then Node's folder and the usual tool folders, each once. */
export const toScriptPath = (currentPath: string | undefined, nodeFolder: string): string => {
  const folders = (currentPath ?? "").split(":").filter((folder) => folder !== "");
  for (const folder of [nodeFolder, ...EXTRA_PATH_FOLDERS]) {
    if (!folders.includes(folder)) {
      folders.push(folder);
    }
  }
  return folders.join(":");
};

const expandHome = (path: string): string => {
  if (path === "~") {
    return homedir();
  }
  return path.startsWith(HOME_PREFIX) ? join(homedir(), path.slice(HOME_PREFIX.length)) : path;
};

/** Keeps colours, and drops every other escape sequence and control character. */
export const keepColorsOnly = (text: string): string =>
  text
    .split(COLOR_SEQUENCE)
    .map((part) =>
      part.startsWith(ESCAPE) && COLOR_SEQUENCE.test(part)
        ? part
        : stripVTControlCharacters(part).replaceAll(OTHER_CONTROL_CHARACTERS, ""),
    )
    .join("");

/** The last line with something on it, as plain text. */
export const toLastLine = (text: string): string => {
  const lines = stripVTControlCharacters(text)
    .split(LINE_BREAK)
    .map((line) => line.replaceAll(OTHER_CONTROL_CHARACTERS, "").trim())
    .filter((line) => line !== "");
  return lines.at(-1) ?? "";
};

const readErrorCode = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "code" in error ? error.code : undefined;

const readOutput = (error: unknown, key: "stdout" | "stderr"): string => {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const value: unknown = Reflect.get(error, key);
  return typeof value === "string" ? value : "";
};

// Errors from starting the script, as opposed to the script itself failing.
const toStartProblem = (script: Script, code: unknown): string | undefined => {
  if (code === "EACCES") {
    return `${script.title} can't run. Make it executable with: chmod +x "${script.path}"`;
  }
  if (code === "ENOEXEC") {
    return `${script.title} can't run. Start it with a line like #!/bin/bash`;
  }
  if (code === "ENOENT") {
    return `${script.title} can't run. The file or the program in its #! line is missing`;
  }
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return `${script.title} printed too much output`;
  }
  return undefined;
};

/** Runs the script with its answers as arguments. Logs neither the answers nor the output. */
export const runScriptFile = async (
  script: Script,
  answers: readonly string[],
): Promise<ScriptResult> =>
  withAction("script.run", { kind: script.mode, count: answers.length }, async () => {
    const workingFolder =
      script.currentDirectoryPath === undefined
        ? dirname(script.path)
        : expandHome(script.currentDirectoryPath);
    try {
      const { stdout, stderr } = await execFileAsync(script.path, [...answers], {
        cwd: workingFolder,
        env: {
          ...UTF8_ENVIRONMENT,
          PATH: toScriptPath(process.env.PATH, dirname(process.execPath)),
        },
        maxBuffer: OUTPUT_LIMIT,
      });
      return { stdout, stderr, failed: false };
    } catch (error) {
      const startProblem = toStartProblem(script, readErrorCode(error));
      if (startProblem !== undefined) {
        throw new Error(startProblem, { cause: error });
      }
      return {
        stdout: readOutput(error, "stdout"),
        stderr: readOutput(error, "stderr"),
        failed: true,
      };
    }
  });

/** What a failed script said last, preferring its errors. */
export const toFailureLine = ({ stdout, stderr }: ScriptResult, title: string): string =>
  toLastLine(stderr) || toLastLine(stdout) || `${title} failed`;

/** Shows a line as a notification, for a script run by a hotkey with no window to show it in. */
export const notify = async (title: string, message: string): Promise<void> => {
  try {
    await runCommand("osascript", ["-e", NOTIFY_SCRIPT, title, message]);
  } catch {
    // Only the notification failed. The script has already run.
  }
};
