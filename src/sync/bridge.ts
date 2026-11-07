import { join } from "node:path";
import { buildDir, projectDir } from "../paths.ts";
import { runCommand } from "../shell.ts";
import { compileSwift } from "../swift-build.ts";

const source = join(projectDir, "native", "SyncBridge.swift");
const binary = join(buildDir, "redhot-sync-bridge");

const prepare = (): Promise<void> => compileSwift([source], binary);

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
