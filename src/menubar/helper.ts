import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { openSync } from "node:fs";
import {
  cliEntryPath,
  helperLogPath,
  helperPath,
  helperSourcePaths,
  imagePreviewPath,
  imagePreviewSourcePath,
  launcherPath,
  recorderPath,
  recorderSourcePath,
} from "../paths.ts";
import { runCommand } from "../shell.ts";
import { compileSwift } from "../swift-build.ts";
import { currentTrace, trackSpawn } from "../log.ts";
import { writeLauncherScript } from "../terminals/launcher-script.ts";
import { signHelper } from "./signing.ts";

const PGREP_NO_MATCH_EXIT_CODE = 1;
const STOP_POLL_MS = 100;
const STOP_TIMEOUT_MS = 5000;

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

export const buildRecorder = (): Promise<void> => compileSwift([recorderSourcePath], recorderPath);

export const buildImagePreview = (): Promise<void> =>
  compileSwift([imagePreviewSourcePath], imagePreviewPath);

export const isMenuBarRunning = async (): Promise<boolean> => {
  const pids = await findHelperPids();
  return pids.length > 0;
};

/** Builds everything the helper needs to run. */
export const prepareMenuBar = async (): Promise<void> => {
  await compileSwift(helperSourcePaths, helperPath);
  await signHelper();
  await buildRecorder();
  await buildImagePreview();
  await writeLauncherScript(launcherPath);
};

export const startMenuBar = async (): Promise<void> => {
  if (await isMenuBarRunning()) {
    return;
  }
  await prepareMenuBar();

  const helperLog = openSync(helperLogPath, "w");
  const helper = trackSpawn(
    spawn(helperPath, [process.execPath, cliEntryPath], {
      detached: true,
      stdio: ["ignore", helperLog, helperLog],
      env: { ...process.env, REDHOT_TRACE: currentTrace() },
    }),
    "redhot-status",
  );
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

/** Stops the helper, waits for it to exit, then starts the current build of it. */
export const restartMenuBar = async (): Promise<void> => {
  await stopMenuBar();
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (await isMenuBarRunning()) {
    if (Date.now() > deadline) {
      throw new Error("The menu bar item didn't stop. Run redhot stop, then redhot start.");
    }
    await delay(STOP_POLL_MS);
  }
  await startMenuBar();
};
