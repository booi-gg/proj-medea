import assert from "node:assert/strict";
import { test } from "node:test";
import { toApps } from "./apps.ts";

const HOME = "/Users/test";
const toNames = (...paths: string[]): string[] => toApps(paths, HOME).map(({ name }) => name);

test("keeps apps from the application folders and Finder", () => {
  assert.deepEqual(
    toNames(
      "/Applications/Safari.app",
      "/System/Applications/Utilities/Terminal.app",
      "/Users/test/Applications/Local.app",
      "/System/Library/CoreServices/Finder.app",
    ),
    ["Finder", "Local", "Safari", "Terminal"],
  );
});

test("drops helpers outside the application folders", () => {
  assert.deepEqual(
    toNames(
      "/System/Library/CoreServices/Dock.app",
      "/Users/test/Library/Application Support/zoom.us/Helper.app",
      "/Users/other/Applications/Old.app",
    ),
    [],
  );
});

test("drops apps nested inside another app", () => {
  assert.deepEqual(
    toNames("/Applications/Big.app", "/Applications/Big.app/Contents/Helpers/Small.app"),
    ["Big"],
  );
});

test("drops paths that are not apps", () => {
  assert.deepEqual(toNames("/Applications/notes.txt", ""), []);
});

test("keeps one app per name", () => {
  const apps = toApps(["/Users/test/Applications/Notes.app", "/Applications/Notes.app"], HOME);
  assert.deepEqual(apps, [{ name: "Notes", path: "/Applications/Notes.app" }]);
});
