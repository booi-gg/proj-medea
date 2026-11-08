import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  listDerivedDataProjects,
  listWorkspaceStorageProjects,
  parseDerivedDataInfo,
  parseWorkspaceFile,
} from "./sources.ts";

const LIMIT = 30;

interface Sandbox {
  root: string;
  projects: string;
  remove: () => void;
}

const createSandbox = (): Sandbox => {
  const base = mkdtempSync(join(tmpdir(), "redhot-projects-"));
  const root = join(base, "storage");
  const projects = join(base, "projects");
  mkdirSync(root);
  mkdirSync(projects);
  return { root, projects, remove: () => rmSync(base, { recursive: true, force: true }) };
};

const addProjectFolder = (projects: string, name: string): string => {
  const path = join(projects, name);
  mkdirSync(path);
  return path;
};

const addWorkspace = (root: string, id: string, projectPath: string, usedAt: number): void => {
  const folder = join(root, id);
  mkdirSync(folder);
  writeFileSync(
    join(folder, "workspace.json"),
    JSON.stringify({ folder: pathToFileURL(projectPath).href }),
  );
  writeFileSync(join(folder, "state.vscdb"), "");
  utimesSync(join(folder, "state.vscdb"), usedAt, usedAt);
};

const toInfoPlist = (path: string): string =>
  `<?xml version="1.0"?><plist version="1.0"><dict>
<key>LastAccessedDate</key><date>2026-01-01T00:00:00Z</date>
<key>WorkspacePath</key>
<string>${path}</string>
</dict></plist>`;

test("reads a folder project", () => {
  assert.equal(parseWorkspaceFile('{"folder":"file:///Users/me/app"}'), "/Users/me/app");
});

test("reads a saved workspace file", () => {
  assert.equal(
    parseWorkspaceFile('{"workspace":"file:///Users/me/all.code-workspace"}'),
    "/Users/me/all.code-workspace",
  );
});

test("turns escaped characters in a path back into real ones", () => {
  assert.equal(parseWorkspaceFile('{"folder":"file:///Users/me/my%20app"}'), "/Users/me/my app");
});

test("a remote project has no local path to open", () => {
  assert.equal(
    parseWorkspaceFile('{"folder":"vscode-remote://ssh-remote+box/home/me"}'),
    undefined,
  );
});

test("a broken or unexpected workspace file is ignored", () => {
  for (const text of ["", "not json", "null", "3", "{}", '{"folder":3}']) {
    assert.equal(parseWorkspaceFile(text), undefined, text);
  }
});

test("reads a project from Xcode's build folder info", () => {
  assert.equal(
    parseDerivedDataInfo(toInfoPlist("/Users/me/App.xcodeproj")),
    "/Users/me/App.xcodeproj",
  );
});

test("undoes XML escaping in an Xcode path", () => {
  assert.equal(
    parseDerivedDataInfo(toInfoPlist("/Users/me/A&amp;B.xcodeproj")),
    "/Users/me/A&B.xcodeproj",
  );
});

test("Xcode build info without a project is ignored", () => {
  assert.equal(parseDerivedDataInfo("<plist></plist>"), undefined);
});

test("lists projects newest first", () => {
  const { root, projects, remove } = createSandbox();
  try {
    const older = addProjectFolder(projects, "older");
    const newer = addProjectFolder(projects, "newer");
    addWorkspace(root, "a", older, 1000);
    addWorkspace(root, "b", newer, 2000);
    assert.deepEqual(listWorkspaceStorageProjects(root, LIMIT), [newer, older]);
  } finally {
    remove();
  }
});

test("a project that's been deleted is left out", () => {
  const { root, projects, remove } = createSandbox();
  try {
    const kept = addProjectFolder(projects, "kept");
    addWorkspace(root, "a", kept, 1000);
    addWorkspace(root, "b", join(projects, "deleted"), 2000);
    assert.deepEqual(listWorkspaceStorageProjects(root, LIMIT), [kept]);
  } finally {
    remove();
  }
});

test("a project with two storage folders is listed once", () => {
  const { root, projects, remove } = createSandbox();
  try {
    const path = addProjectFolder(projects, "app");
    addWorkspace(root, "a", path, 1000);
    addWorkspace(root, "b", path, 2000);
    assert.deepEqual(listWorkspaceStorageProjects(root, LIMIT), [path]);
  } finally {
    remove();
  }
});

test("the list stops at its limit and keeps the newest", () => {
  const { root, projects, remove } = createSandbox();
  try {
    const first = addProjectFolder(projects, "first");
    const second = addProjectFolder(projects, "second");
    const third = addProjectFolder(projects, "third");
    addWorkspace(root, "a", first, 3000);
    addWorkspace(root, "b", second, 2000);
    addWorkspace(root, "c", third, 1000);
    assert.deepEqual(listWorkspaceStorageProjects(root, 2), [first, second]);
  } finally {
    remove();
  }
});

test("an app that's never been opened has nothing to list", () => {
  assert.deepEqual(listWorkspaceStorageProjects("/nonexistent/redhot", LIMIT), []);
  assert.deepEqual(listDerivedDataProjects("/nonexistent/redhot", LIMIT), []);
});

test("lists Xcode projects from their build folders", () => {
  const { root, projects, remove } = createSandbox();
  try {
    const project = addProjectFolder(projects, "App.xcodeproj");
    const folder = join(root, "App-abc");
    mkdirSync(folder);
    writeFileSync(join(folder, "info.plist"), toInfoPlist(project));
    mkdirSync(join(root, "ModuleCache.noindex"));
    assert.deepEqual(listDerivedDataProjects(root, LIMIT), [project]);
  } finally {
    remove();
  }
});
