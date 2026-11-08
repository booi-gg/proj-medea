import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectDir } from "./paths.ts";

/** The version in package.json, which npm ships with every install. */
export const readVersion = async (): Promise<string> => {
  const { version } = JSON.parse(await readFile(join(projectDir, "package.json"), "utf8"));
  if (typeof version !== "string") {
    throw new TypeError("package.json has no version.");
  }
  return version;
};
