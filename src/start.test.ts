import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const START_PATH = join(import.meta.dirname, "start.js");

const runStartAs = (platform: string) =>
  spawnSync(
    process.execPath,
    [
      "--import",
      `data:text/javascript,Object.defineProperty(process, "platform", { value: "${platform}" });`,
      START_PATH,
      "status",
    ],
    { encoding: "utf8" },
  );

test("refuses to run on Windows", () => {
  const { status, stderr } = runStartAs("win32");
  assert.equal(status, 1);
  assert.equal(stderr, "Redhot only runs on macOS, and this computer runs Windows.\n");
});

test("names an unknown system as Node reports it", () => {
  assert.match(runStartAs("freebsd").stderr, /this computer runs freebsd\.$/m);
});
