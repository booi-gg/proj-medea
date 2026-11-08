import assert from "node:assert/strict";
import { test } from "node:test";
import { toProjectKind, toProjectName } from "./index.ts";

test("a project file loses its extension, so it searches by name", () => {
  assert.equal(toProjectName("/Users/me/App.xcodeproj"), "App");
  assert.equal(toProjectName("/Users/me/App.xcworkspace"), "App");
  assert.equal(toProjectName("/Users/me/all.code-workspace"), "all");
});

test("a folder keeps its whole name, even with a dot in it", () => {
  assert.equal(toProjectName("/Users/me/my.site"), "my.site");
  assert.equal(toProjectName("/Users/me/proj-medea"), "proj-medea");
});

test("the row says which app it opens in and where the project is", () => {
  assert.equal(toProjectKind("VS Code", "/Users/me/personal/web"), "VS Code · personal");
});
