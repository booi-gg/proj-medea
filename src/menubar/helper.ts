import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, openSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import {
  buildDir,
  cliEntryPath,
  helperLogPath,
  helperPath,
  launcherPath,
  recorderPath,
  recorderSourcePath,
  swiftSourcePath,
} from "../paths.ts";
import { runCommand } from "../shell.ts";
import { writeLauncherScript } from "../terminals/launcher-script.ts";

const PGREP_NO_MATCH_EXIT_CODE = 1;

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

const isBuildCurrent = async (sourcePath: string, binaryPath: string): Promise<boolean> => {
  if (!existsSync(binaryPath)) {
    return false;
  }
  const [source, binary] = await Promise.all([stat(sourcePath), stat(binaryPath)]);
  return binary.mtimeMs >= source.mtimeMs;
};

const compileSwift = async (sourcePath: string, binaryPath: string): Promise<void> => {
  if (await isBuildCurrent(sourcePath, binaryPath)) {
    return;
  }
  await mkdir(buildDir, { recursive: true });
  await runCommand("swiftc", ["-O", sourcePath, "-o", binaryPath, "-framework", "AppKit"]);
};

export const buildRecorder = (): Promise<void> => compileSwift(recorderSourcePath, recorderPath);

export const isMenuBarRunning = async (): Promise<boolean> => {
  const pids = await findHelperPids();
  return pids.length > 0;
};

/** Builds everything the helper needs to run. */
export const prepareMenuBar = async (): Promise<void> => {
  await compileSwift(swiftSourcePath, helperPath);
  await buildRecorder();
  await writeLauncherScript(launcherPath);
};

export const startMenuBar = async (): Promise<void> => {
  if (await isMenuBarRunning()) {
    return;
  }
  await prepareMenuBar();

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

/** Tells the running helper to register the saved hotkeys again. */
export const reloadHotkeys = async (): Promise<void> => {
  const pids = await findHelperPids();
  for (const pid of pids) {
    process.kill(pid, "SIGUSR1");
  }
};
