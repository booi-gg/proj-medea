import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listBrowserBookmarks, parseBookmarksFile } from "./sources.ts";

const LIMIT = 100;

const toLink = (name: string, url: string): object => ({ type: "url", name, url });

const toFile = (...children: readonly object[]): string =>
  JSON.stringify({ roots: { bookmark_bar: { type: "folder", children } } });

const addProfile = (root: string, profile: string, text: string): void => {
  const folder = join(root, profile);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "Bookmarks"), text);
};

const withUserData = (run: (root: string) => void): void => {
  const root = mkdtempSync(join(tmpdir(), "redhot-bookmarks-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const toUrls = (bookmarks: readonly { url: string }[]): string[] => bookmarks.map(({ url }) => url);

test("finds bookmarks inside folders, in the browser's order", () => {
  const text = toFile(
    toLink("First", "https://first.example/"),
    { type: "folder", children: [toLink("Nested", "https://nested.example/")] },
    toLink("Last", "https://last.example/"),
  );
  assert.deepEqual(
    parseBookmarksFile(text).map(({ title }) => title),
    ["First", "Nested", "Last"],
  );
});

test("reads every root, like Other Bookmarks and Mobile Bookmarks", () => {
  const text = JSON.stringify({
    roots: {
      bookmark_bar: { children: [toLink("Bar", "https://bar.example/")] },
      other: { children: [toLink("Other", "https://other.example/")] },
      synced: { children: [toLink("Mobile", "https://mobile.example/")] },
    },
  });
  assert.equal(parseBookmarksFile(text).length, 3);
});

test("only keeps web pages, so a bookmarklet can never be run", () => {
  const text = toFile(
    toLink("Bookmarklet", "javascript:alert(1)"),
    toLink("Settings", "chrome://settings/"),
    toLink("Local", "file:///etc/hosts"),
    toLink("Broken", "not a url"),
    toLink("Web", "http://web.example/"),
  );
  assert.deepEqual(toUrls(parseBookmarksFile(text)), ["http://web.example/"]);
});

test("a broken or unexpected file is ignored", () => {
  for (const text of ["", "not json", "null", "3", "{}", '{"roots":3}', '{"roots":{"a":3}}']) {
    assert.deepEqual(parseBookmarksFile(text), [], text);
  }
});

test("reads each person's profile, but not the guest one", () => {
  withUserData((root) => {
    addProfile(root, "Default", toFile(toLink("Main", "https://main.example/")));
    addProfile(root, "Profile 6", toFile(toLink("Work", "https://work.example/")));
    addProfile(root, "Guest Profile", toFile(toLink("Guest", "https://guest.example/")));
    assert.deepEqual(toUrls(listBrowserBookmarks(root, LIMIT)), [
      "https://main.example/",
      "https://work.example/",
    ]);
  });
});

test("a page saved in two profiles is listed once", () => {
  withUserData((root) => {
    addProfile(root, "Default", toFile(toLink("Same", "https://same.example/")));
    addProfile(root, "Profile 1", toFile(toLink("Again", "https://same.example/")));
    assert.equal(listBrowserBookmarks(root, LIMIT).length, 1);
  });
});

test("stops at the limit", () => {
  withUserData((root) => {
    const links = ["a", "b", "c"].map((name) => toLink(name, `https://${name}.example/`));
    addProfile(root, "Default", toFile(...links));
    assert.equal(listBrowserBookmarks(root, 2).length, 2);
  });
});

test("a browser that was never opened has no bookmarks", () => {
  assert.deepEqual(listBrowserBookmarks("/nothing/here", LIMIT), []);
});
