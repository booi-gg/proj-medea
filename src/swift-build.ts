import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { runCommand } from "./shell.ts";

// Some CLT installations pair the default 26.x SDK with an older Swift compiler.
const COMPATIBLE_SDK = "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk";

const MODULE_CACHE_KEY_LENGTH = 16;

const stampPath = (binaryPath: string): string => `${binaryPath}.sha256`;

/**
 * Precompiled modules record the absolute path they were built at, and swiftc refuses them if the
 * cache has since moved. Keying the folder by location gives a moved project a fresh cache.
 */
export const moduleCachePath = (outputDir: string): string => {
  const key = createHash("sha256").update(outputDir).digest("hex");
  return join(outputDir, "clang-module-cache", key.slice(0, MODULE_CACHE_KEY_LENGTH));
};

const hashSources = async (sourcePaths: readonly string[]): Promise<string> => {
  const contents = await Promise.all(sourcePaths.map((sourcePath) => readFile(sourcePath)));
  const hash = createHash("sha256");
  for (const content of contents) {
    hash.update(content);
  }
  return hash.digest("hex");
};

const readStamp = async (binaryPath: string): Promise<string | undefined> => {
  try {
    return await readFile(stampPath(binaryPath), "utf8");
  } catch {
    return undefined;
  }
};

/**
 * Compares the sources' contents, not their times. npm gives every published file the same date
 * in 1985, so after an upgrade an old binary would always look newer than the new sources.
 */
export const isBuildCurrent = async (
  sourcePaths: readonly string[],
  binaryPath: string,
): Promise<boolean> => {
  if (!existsSync(binaryPath)) {
    return false;
  }
  const [stamp, hash] = await Promise.all([readStamp(binaryPath), hashSources(sourcePaths)]);
  return stamp === hash;
};

/** Records which sources the binary was built from. */
export const markBuilt = async (
  sourcePaths: readonly string[],
  binaryPath: string,
): Promise<void> => {
  await writeFile(stampPath(binaryPath), await hashSources(sourcePaths));
};

export const compileSwift = async (
  sourcePaths: readonly string[],
  binaryPath: string,
): Promise<void> => {
  if (await isBuildCurrent(sourcePaths, binaryPath)) {
    return;
  }
  const outputDir = dirname(binaryPath);
  await mkdir(outputDir, { recursive: true });
  await runCommand("swiftc", ["-O", ...sourcePaths, "-o", binaryPath, "-framework", "AppKit"], {
    env: {
      ...process.env,
      ...(existsSync(COMPATIBLE_SDK) ? { SDKROOT: COMPATIBLE_SDK } : {}),
      CLANG_MODULE_CACHE_PATH: moduleCachePath(outputDir),
    },
  });
  await markBuilt(sourcePaths, binaryPath);
};
