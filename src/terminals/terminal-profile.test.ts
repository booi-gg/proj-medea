import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { toMinimalProfile } from "./terminal-profile.ts";

const execFileAsync = promisify(execFile);

test("the fallback profile is a valid plist that runs the launcher as the shell", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redhot-profile-test-"));
  const profilePath = join(dir, "Redhot.terminal");
  await writeFile(profilePath, toMinimalProfile("/a & b/open-redhot.command"));
  const { stdout } = await execFileAsync("plutil", ["-convert", "json", "-o", "-", profilePath]);
  await rm(dir, { recursive: true });
  assert.deepEqual(JSON.parse(stdout), {
    name: "Redhot",
    type: "Window Settings",
    CommandString: "/a & b/open-redhot.command",
    RunCommandAsShell: true,
    columnCount: 80,
    rowCount: 18,
  });
});
