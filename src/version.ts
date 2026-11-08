import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectDir } from "./paths.ts";

export interface PackageInfo {
  name: string;
  version: string;
}

/** The name and version in package.json, which npm ships with every install. */
export const readPackageInfo = async (): Promise<PackageInfo> => {
  const { name, version } = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"));
  if (typeof name !== "string" || typeof version !== "string") {
    throw new TypeError("package.json has no name or version.");
  }
  return { name, version };
};

export const readVersion = async (): Promise<string> => (await readPackageInfo()).version;
