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
  await writeLauncherScript(launcherPath);

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
