import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listSettingsActions } from "../registry.ts";
import { canUninstall, isRunningFrom } from "./bundle.ts";
import { toTrashCommand } from "./trash.ts";

test("apps that come with macOS can't be uninstalled", () => {
  assert.equal(canUninstall("/System/Applications/Chess.app"), false);
  assert.equal(canUninstall("/System/Library/CoreServices/Finder.app"), false);
});

test("an app that's a link into the system counts as a system app", async () => {
  const folder = await mkdtemp(join(tmpdir(), "redhot-uninstall-link-"));
  try {
    const link = join(folder, "Chess.app");
    await symlink("/System/Applications/Chess.app", link);
    assert.equal(canUninstall(link), false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("only an app's full path can be uninstalled", () => {
  assert.equal(canUninstall("/Applications/Widget.app"), true);
  assert.equal(canUninstall("Widget.app"), false);
  assert.equal(canUninstall("/Applications/Widget"), false);
  assert.equal(canUninstall("redhot-logs:view"), false);
});

test("an app's settings offer Uninstall, and a system app's don't", () => {
  const labelsFor = (value: string): string[] =>
    listSettingsActions(value).map(({ label }) => label);
  assert.deepEqual(labelsFor("/Applications/Widget.app"), ["Uninstall App"]);
  assert.deepEqual(labelsFor("/System/Applications/Chess.app"), []);
  assert.deepEqual(labelsFor("redhot-logs:view"), []);
});

test("an app counts as running when any program inside it is", () => {
  const commands = [
    "/usr/libexec/logd",
    "/Applications/Widget.app/Contents/Frameworks/Widget Helper.app/Contents/MacOS/Widget Helper",
  ].join("\n");
  assert.equal(isRunningFrom(commands, ["/Applications/Widget.app"]), true);
});

test("an app with a similar path doesn't count as running", () => {
  const commands = "/Applications/Widget Pro.app/Contents/MacOS/Widget Pro\n/opt/Widget.app";
  assert.equal(isRunningFrom(commands, ["/Applications/Widget.app"]), false);
});

test("the real path counts too, for an app reached through a link", () => {
  const commands = "/opt/Apps/Widget.app/Contents/MacOS/Widget";
  assert.equal(isRunningFrom(commands, ["/Applications/Widget.app", "/opt/Apps/Widget.app"]), true);
});

test("the Trash tool is told to report failures", () => {
  assert.deepEqual(toTrashCommand("/Applications/Widget.app", true), {
    file: "/usr/bin/trash",
    args: ["-s", "/Applications/Widget.app"],
  });
});

test("Finder takes over without the Trash tool, with the path kept out of the script", () => {
  const path = '/Applications/Wid"get.app';
  const { file, args } = toTrashCommand(path, false);
  assert.equal(file, "osascript");
  assert.equal(args.at(-1), path);
  assert.equal(args.filter((arg) => arg.includes("Wid")).length, 1);
});
