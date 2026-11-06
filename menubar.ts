import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, openSync } from "node:fs";
import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { focusRunningCli } from "./instance.ts";
import { getSelectedLauncher, quoteForShell } from "./terminals.ts";

const runCommand = promisify(execFile);

const PGREP_NO_MATCH_EXIT_CODE = 1;
const projectDir = import.meta.dirname;
const buildDir = join(projectDir, ".build");
const cliEntryPath = join(projectDir, "index.ts");
const swiftSourcePath = join(projectDir, "native", "StatusItem.swift");
const helperPath = join(buildDir, "supercast-status");
const launcherPath = join(buildDir, "open-supercast.command");
const helperLogPath = join(buildDir, "helper.log");

const isNoMatchError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === PGREP_NO_MATCH_EXIT_CODE;

const findHelperPids = async (): Promise<number[]> => {
  try {
    const { stdout } = await runCommand("pgrep", ["-f", helperPath]);
    return stdout.trim().split("\n").map(Number);
  } catch (error) {
    if (isNoMatchError(error)) {
      return [];
    }
    throw error;
  }
};

const isHelperBuildCurrent = async (): Promise<boolean> => {
  if (!existsSync(helperPath)) {
    return false;
  }
  const [source, helper] = await Promise.all([stat(swiftSourcePath), stat(helperPath)]);
  return helper.mtimeMs >= source.mtimeMs;
};

const buildHelper = async (): Promise<void> => {
  if (await isHelperBuildCurrent()) {
    return;
  }
  await runCommand("swiftc", ["-O", swiftSourcePath, "-o", helperPath, "-framework", "AppKit"]);
};

// The absolute Node path keeps this working when Terminal's PATH differs from this shell's.
const writeLauncher = async (): Promise<void> => {
  const script = [
    "#!/bin/zsh",
    `cd ${quoteForShell(projectDir)}`,
    `exec ${quoteForShell(process.execPath)} ${quoteForShell(cliEntryPath)}`,
    "",
  ].join("\n");
  await writeFile(launcherPath, script);
  await chmod(launcherPath, 0o755);
};

export const isMenuBarRunning = async (): Promise<boolean> => {
  const pids = await findHelperPids();
  return pids.length > 0;
};

export const startMenuBar = async (): Promise<void> => {
  if (await isMenuBarRunning()) {
    return;
  }
  await mkdir(buildDir, { recursive: true });
  await buildHelper();
  await writeLauncher();

  const helperLog = openSync(helperLogPath, "w");
  const helper = spawn(helperPath, [process.execPath, cliEntryPath], {
    detached: true,
    stdio: ["ignore", helperLog, helperLog],
  });
  await once(helper, "spawn");
  helper.unref();
};

export const stopMenuBar = async (): Promise<void> => {
  const pids = await findHelperPids();
  for (const pid of pids) {
    process.kill(pid);
  }
};

/** Reuses a running CLI window, or opens a new one in the chosen terminal. */
export const showCli = async (): Promise<void> => {
  const launcher = await getSelectedLauncher();
  const runningTtyPath = await focusRunningCli();
  if (runningTtyPath === undefined) {
    await launcher.open(launcherPath);
    return;
  }
  await launcher.focus(runningTtyPath);
};
