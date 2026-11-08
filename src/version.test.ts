import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { readVersion } from "./version.ts";

const PACKAGE_PATH = join(import.meta.dirname, "..", "package.json");
const START_PATH = join(import.meta.dirname, "start.js");

test("reads the version from package.json", async () => {
  const { version } = JSON.parse(await readFile(PACKAGE_PATH, "utf8"));
  assert.equal(await readVersion(), version);
});

test("prints only the version for --version, -v and version", async () => {
  const version = await readVersion();
  for (const flag of ["--version", "-v", "version"]) {
    const { status, stdout } = spawnSync(process.execPath, [START_PATH, flag], {
      encoding: "utf8",
    });
    assert.equal(status, 0);
    assert.equal(stdout, `${version}\n`);
  }
});
