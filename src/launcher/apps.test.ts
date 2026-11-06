import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { findAppPaths, toApps } from "./apps.ts";

let root = "";

before(async () => {
  root = await mkdtemp(join(tmpdir(), "supercast-apps-"));
  await mkdir(join(root, "Top.app", "Contents", "Helpers", "Helper.app"), { recursive: true });
  await mkdir(join(root, "Vendor", "Suite", "Nested.app"), { recursive: true });
  await mkdir(join(root, "Vendor", "Suite", "Deep", "TooDeep.app"), { recursive: true });
  await mkdir(join(root, ".Hidden.app"));
  await mkdir(join(root, "Target.app"));
  await symlink(join(root, "Target.app"), join(root, "Linked.app"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

const toRelative = (paths: string[]): string[] =>
  paths.map((path) => path.slice(root.length + 1)).toSorted();

test("finds apps, including symlinks and apps in subfolders", async () => {
  assert.deepEqual(toRelative(await findAppPaths(root, 2)), [
    "Linked.app",
    "Target.app",
    "Top.app",
    "Vendor/Suite/Nested.app",
  ]);
});

test("never looks inside an app bundle", async () => {
  const paths = await findAppPaths(root, 5);
  assert.ok(!paths.some((path) => path.includes("Helper.app")));
});

test("stops at the depth limit", async () => {
  assert.ok(!(await findAppPaths(root, 2)).some((path) => path.includes("TooDeep.app")));
});

test("a missing folder gives no apps", async () => {
  assert.deepEqual(await findAppPaths(join(root, "missing"), 2), []);
});

test("names apps and sorts them", () => {
  const names = toApps(["/Applications/Zoom.app", "/Applications/Arc.app"]).map(({ name }) => name);
  assert.deepEqual(names, ["Arc", "Zoom"]);
});

test("keeps one app per name", () => {
  assert.deepEqual(toApps(["/Users/test/Applications/Notes.app", "/Applications/Notes.app"]), [
    { name: "Notes", path: "/Applications/Notes.app" },
  ]);
});
