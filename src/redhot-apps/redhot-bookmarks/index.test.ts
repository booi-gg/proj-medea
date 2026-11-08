import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// Set before anything is imported, because the paths are worked out from it as they load.
const home = mkdtempSync(join(tmpdir(), "redhot-bookmarks-setting-"));
process.env.HOME = home;
const profile = join(home, "Library", "Application Support", "Google", "Chrome", "Default");
mkdirSync(profile, { recursive: true });
mkdirSync(join(home, "Applications", "Google Chrome.app"), { recursive: true });
writeFileSync(
  join(profile, "Bookmarks"),
  JSON.stringify({
    roots: {
      bookmark_bar: { children: [{ type: "url", name: "Docs", url: "https://docs.example/" }] },
    },
  }),
);

const { browserBookmarks, toBookmarkKind, toBookmarkName } = await import("./index.ts");

const saveConfig = (config: object): void => {
  const folder = join(home, ".config", "redhot");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "config.json"), JSON.stringify(config));
};

const listNames = (): string[] => browserBookmarks.listItems().map(({ name }) => name);

after(() => {
  rmSync(home, { recursive: true, force: true });
});

test("bookmarks stay out of search until the setting is turned on", () => {
  assert.deepEqual(listNames(), []);
  saveConfig({});
  assert.deepEqual(listNames(), []);
});

test("turning the setting on and off takes effect straight away", () => {
  saveConfig({ browserBookmarks: true });
  assert.deepEqual(listNames(), ["Docs"]);
  saveConfig({ browserBookmarks: false });
  assert.deepEqual(listNames(), []);
});

test("a browser that isn't installed adds nothing", () => {
  saveConfig({ browserBookmarks: true });
  const values = browserBookmarks.listItems().map(({ value }) => value);
  assert.deepEqual(values, ["redhot-bookmarks:chrome:https://docs.example/"]);
});

test("a bookmark with no title is called after its site", () => {
  assert.equal(toBookmarkName({ title: "  ", url: "https://www.site.example/a" }), "site.example");
});

test("a title can't send anything to the terminal", () => {
  assert.equal(toBookmarkName({ title: "A\u001B[31mB", url: "https://a.example/" }), "A[31mB");
});

test("a long title is cut, so the row can't wrap", () => {
  const name = toBookmarkName({ title: "x".repeat(200), url: "https://a.example/" });
  assert.equal(name.length, 44);
  assert.ok(name.endsWith("…"));
});

test("the row says which browser it opens in and which site it is", () => {
  assert.equal(toBookmarkKind("Chrome", "https://www.site.example/page"), "Chrome · site.example");
});
