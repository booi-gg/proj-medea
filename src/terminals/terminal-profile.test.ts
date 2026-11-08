import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { toMinimalProfile, toTerminalCommand } from "./terminal-profile.ts";

const execFileAsync = promisify(execFile);

test("the fallback profile is a valid plist that runs the launcher as the shell", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redhot-profile-test-"));
  const profilePath = join(dir, "Redhot.terminal");
  await writeFile(profilePath, toMinimalProfile("/a & b/open-redhot.command"));
  const { stdout } = await execFileAsync("plutil", ["-convert", "json", "-o", "-", profilePath]);
  await rm(dir, { recursive: true });
  const { name, ...profile } = JSON.parse(stdout);
  assert.match(name, /^Redhot/u);
  assert.deepEqual(profile, {
    type: "Window Settings",
    CommandString: toTerminalCommand("/a & b/open-redhot.command"),
    RunCommandAsShell: true,
    columnCount: 80,
    rowCount: 18,
  });
});

test("the command has no spaces inside the launcher path", () => {
  assert.equal(
    toTerminalCommand("/Users/me/Library/Application Support/Redhot/open-redhot.command"),
    String.raw`/bin/zsh -fc $'/Users/me/Library/Application\x20Support/Redhot/open-redhot.command'`,
  );
});

// Terminal splits the command at spaces and passes each piece to the program as it is.
test("the command runs a launcher whose path has spaces, quotes and accents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "redhot-profile-test-"));
  const launcherDir = join(dir, `Application Support & "it's" é`);
  const launcherPath = join(launcherDir, "open-redhot.command");
  await mkdir(launcherDir);
  await writeFile(launcherPath, "#!/bin/sh\necho launched\n");
  await chmod(launcherPath, 0o755);
  const [program = "", ...args] = toTerminalCommand(launcherPath).split(" ");
  const { stdout } = await execFileAsync(program, args);
  await rm(dir, { recursive: true });
  assert.equal(stdout, "launched\n");
});
