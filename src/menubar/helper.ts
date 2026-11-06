import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, openSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  buildDir,
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
import { currentTrace, trackSpawn } from "../log.ts";
import { writeLauncherScript } from "../terminals/launcher-script.ts";
import { signHelper } from "./signing.ts";

const PGREP_NO_MATCH_EXIT_CODE = 1;
// Some CLT installations pair the default 26.x SDK with an older Swift compiler.
const COMPATIBLE_SDK = "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk";

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

const isBuildCurrent = async (
  sourcePaths: readonly string[],
  binaryPath: string,
): Promise<boolean> => {
  if (!existsSync(binaryPath)) {
    return false;
  }
  const [binary, sources] = await Promise.all([
    stat(binaryPath),
    Promise.all(sourcePaths.map((sourcePath) => stat(sourcePath))),
  ]);
  return sources.every((source) => binary.mtimeMs >= source.mtimeMs);
};

const compileSwift = async (sourcePaths: readonly string[], binaryPath: string): Promise<void> => {
  if (await isBuildCurrent(sourcePaths, binaryPath)) {
    return;
  }
  await mkdir(buildDir, { recursive: true });
  await runCommand("swiftc", ["-O", ...sourcePaths, "-o", binaryPath, "-framework", "AppKit"], {
    env: {
      ...process.env,
      ...(existsSync(COMPATIBLE_SDK) ? { SDKROOT: COMPATIBLE_SDK } : {}),
      CLANG_MODULE_CACHE_PATH: join(buildDir, "clang-module-cache"),
    },
  });
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
      env: { ...process.env, MEDEA_TRACE: currentTrace() },
    }),
    "medea-status",
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
