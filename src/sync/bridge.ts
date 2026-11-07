import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildDir, projectDir } from "../paths.ts";
import { runCommand } from "../shell.ts";

const source = join(projectDir, "native", "SyncBridge.swift");
const binary = join(buildDir, "medea-sync-bridge");
const compatibleSdk = "/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk";

const prepare = async (): Promise<void> => {
  await mkdir(buildDir, { recursive: true });
  const sourceTime = (await stat(source)).mtimeMs;
  const binaryTime = await stat(binary)
    .then((info) => info.mtimeMs)
    .catch(() => 0);
  if (binaryTime >= sourceTime) return;
  await runCommand("swiftc", ["-O", source, "-o", binary, "-framework", "AppKit"], {
    env: {
      ...process.env,
      ...(existsSync(compatibleSdk) ? { SDKROOT: compatibleSdk } : {}),
      CLANG_MODULE_CACHE_PATH: join(buildDir, "clang-module-cache"),
    },
  });
};

export const chooseICloudFolder = async (): Promise<string | undefined> => {
  await prepare();
  try {
    return (await runCommand(binary, ["choose"])).stdout.trim() || undefined;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 2) return undefined;
    throw error;
  }
};

export const coordinatedCopy = async (
  direction: "read" | "write",
  sourcePath: string,
  destinationPath: string,
): Promise<void> => {
  await prepare();
  await runCommand(binary, [direction, sourcePath, destinationPath]);
};
