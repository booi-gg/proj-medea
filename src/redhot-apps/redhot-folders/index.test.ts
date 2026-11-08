import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { toFileRow } from "../redhot-files/format.ts";
import { createFileSearch } from "../redhot-files/search.ts";
import type { FileResult, FindFiles } from "../redhot-files/search.ts";
import { folders, isSearchableFolder, toFolderQuery } from "./index.ts";
import { hasRealPath, toPlaces } from "./places.ts";

const HOME = "/Users/me";
const DELAY_MS = 1;
const SETTLE_MS = 20;

const toPlace = (name: string, path: string): FileResult => ({
  name,
  path,
  lastUsed: 0,
  location: "Finder",
});

const DOWNLOADS = toPlace("Downloads", `${HOME}/Downloads`);
const DOCUMENTS = toPlace("Documents", `${HOME}/Documents`);

const toEntry = (path: string): string => `${path}   kMDItemLastUsedDate = (null)`;

const findAnswering =
  (...paths: readonly string[]): FindFiles =>
  async (_query, onEntries) => {
    onEntries(paths.map(toEntry));
  };

const names = (results: readonly FileResult[]): string[] => results.map(({ name }) => name);

test("the query asks Spotlight for folders only", () => {
  assert.equal(
    toFolderQuery("tax"),
    'kMDItemFSName == "*tax*"cd && kMDItemContentType == "public.folder"',
  );
});

test("blank text is no search at all", () => {
  assert.equal(toFolderQuery("  "), undefined);
});

test("keeps ordinary folders", () => {
  assert.ok(isSearchableFolder("/Users/me/Work/Taxes", HOME));
  assert.ok(isSearchableFolder("/Volumes/Backup/Photos", HOME));
});

test("a skipped folder is left out by its own name as well as inside another", () => {
  assert.equal(isSearchableFolder("/Users/me/app/node_modules", HOME), false);
  assert.equal(isSearchableFolder("/Users/me/app/node_modules/lib", HOME), false);
  assert.equal(isSearchableFolder("/Users/me/app/.git", HOME), false);
  assert.equal(isSearchableFolder("/Users/me/Library", HOME), false);
});

test("lists the places before anything is typed", () => {
  const search = createFileSearch({
    find: findAnswering(),
    delayMs: DELAY_MS,
    home: HOME,
    pinned: [DOWNLOADS, DOCUMENTS],
  });
  assert.deepEqual(names(search.getResults()), ["Downloads", "Documents"]);
});

test("a matching place shows at once, above what Spotlight finds", async () => {
  const search = createFileSearch({
    find: findAnswering(`${HOME}/Work/Downloads Old`),
    delayMs: DELAY_MS,
    home: HOME,
    toQuery: toFolderQuery,
    isSearchable: isSearchableFolder,
    pinned: [DOWNLOADS, DOCUMENTS],
  });
  search.setQuery("down");
  assert.deepEqual(names(search.getResults()), ["Downloads"]);
  await wait(SETTLE_MS);
  assert.deepEqual(names(search.getResults()), ["Downloads", "Downloads Old"]);
});

test("a place Spotlight also finds isn't listed twice", async () => {
  const search = createFileSearch({
    find: findAnswering(DOWNLOADS.path),
    delayMs: DELAY_MS,
    home: HOME,
    toQuery: toFolderQuery,
    isSearchable: isSearchableFolder,
    pinned: [DOWNLOADS],
  });
  search.setQuery("downloads");
  await wait(SETTLE_MS);
  assert.deepEqual(names(search.getResults()), ["Downloads"]);
});

test("a place that doesn't match the text isn't listed", () => {
  const search = createFileSearch({
    find: findAnswering(),
    delayMs: DELAY_MS,
    home: HOME,
    pinned: [DOWNLOADS, DOCUMENTS],
  });
  search.setQuery("doc");
  assert.deepEqual(names(search.getResults()), ["Documents"]);
  search.stop();
});

test("the usual places are offered, with Recents first", () => {
  const places = toPlaces(HOME, () => true);
  assert.deepEqual(names(places).slice(0, 3), ["Recents", "Downloads", "Documents"]);
  assert.equal(places.find(({ name }) => name === "Downloads")?.path, `${HOME}/Downloads`);
});

test("a place this Mac doesn't have is left out", () => {
  const places = toPlaces(HOME, (path) => !path.includes("CloudDocs"));
  assert.equal(
    places.some(({ name }) => name === "iCloud Drive"),
    false,
  );
});

test("only Recents has no real folder behind it", () => {
  const places = toPlaces(HOME, () => true);
  assert.deepEqual(
    places.filter(({ path }) => !hasRealPath(path)).map(({ name }) => name),
    ["Recents"],
  );
});

test("a place says Finder where a search result says its folder", () => {
  assert.equal(stripVTControlCharacters(toFileRow(DOWNLOADS, 40, HOME)), "Downloads  Finder");
});

test("Search Folders is its own command and opens a window", () => {
  const [item] = folders.listItems();
  assert.equal(item?.value, "redhot-folders:search");
  assert.equal(item?.name, "Search Folders");
  assert.equal(item?.needsWindow, true);
});
