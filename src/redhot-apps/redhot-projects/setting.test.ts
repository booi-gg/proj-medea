import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";

// Set before anything is imported, because the paths are worked out from it as they load.
const home = mkdtempSync(join(tmpdir(), "redhot-projects-setting-"));
process.env.HOME = home;
const project = join(home, "code", "my-app");
const storage = join(
  home,
  "Library",
  "Application Support",
  "Code",
  "User",
  "workspaceStorage",
  "abc",
);
mkdirSync(project, { recursive: true });
mkdirSync(storage, { recursive: true });
mkdirSync(join(home, "Applications", "Visual Studio Code.app"), { recursive: true });
writeFileSync(
  join(storage, "workspace.json"),
  JSON.stringify({ folder: pathToFileURL(project).href }),
);
writeFileSync(join(storage, "state.vscdb"), "");

const { recentProjects } = await import("./index.ts");

const saveConfig = (config: object): void => {
  const folder = join(home, ".config", "redhot");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "config.json"), JSON.stringify(config));
};

const listNames = (): string[] => recentProjects.listItems().map(({ name }) => name);

after(() => {
  rmSync(home, { recursive: true, force: true });
});

test("projects stay out of search until the setting is turned on", () => {
  assert.deepEqual(listNames(), []);
  saveConfig({});
  assert.deepEqual(listNames(), []);
});

test("turning the setting on and off takes effect straight away", () => {
  saveConfig({ recentProjects: true });
  assert.deepEqual(listNames(), ["my-app"]);
  saveConfig({ recentProjects: false });
  assert.deepEqual(listNames(), []);
});
