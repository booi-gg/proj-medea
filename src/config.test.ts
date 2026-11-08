import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "./config.ts";

test("reads aliases and hotkeys, and drops the old terminal choice", () => {
  const config = parseConfig(
    '{ "terminal": "Ghostty", "aliases": { "/a.app": ["a", "b"] }, "hotkeys": { "/a.app": "shift+cmd+k" } }',
  );
  assert.deepEqual(config, {
    aliases: { "/a.app": ["a", "b"] },
    hotkeys: { "/a.app": "shift+cmd+k" },
  });
});

test("broken or empty config reads as empty", () => {
  for (const text of ["not json", "null", "[]", "3"]) {
    assert.deepEqual(parseConfig(text), { aliases: {}, hotkeys: {} });
  }
});

test("keeps a known web search engine and drops anything else", () => {
  assert.equal(parseConfig('{ "webSearchEngine": "kagi" }').webSearchEngine, "kagi");
  assert.equal(parseConfig('{ "webSearchEngine": "bing" }').webSearchEngine, undefined);
});

test("ignores malformed aliases", () => {
  const config = parseConfig('{ "aliases": { "/a.app": "nope", "/b.app": [1], "/c.app": ["c"] } }');
  assert.deepEqual(config.aliases, { "/c.app": ["c"] });
});

test("ignores malformed hotkeys", () => {
  const config = parseConfig('{ "hotkeys": { "/a.app": 3, "/b.app": "shift+cmd+k" } }');
  assert.deepEqual(config.hotkeys, { "/b.app": "shift+cmd+k" });
});

test("a config from before aliases still works", () => {
  assert.deepEqual(parseConfig('{ "terminal": "Terminal" }'), {
    aliases: {},
    hotkeys: {},
  });
});

test("reads a clipboard history length from the choices", () => {
  assert.equal(parseConfig('{ "clipboardHistoryMonths": 4 }').clipboardHistoryMonths, 4);
});

test("ignores a clipboard history length that isn't a choice", () => {
  for (const value of ["1", "6", '"3"', "null", "-1"]) {
    const config = parseConfig(`{ "clipboardHistoryMonths": ${value} }`);
    assert.equal(config.clipboardHistoryMonths, undefined);
  }
});

test("accepts only supported log size limits", () => {
  assert.equal(parseConfig('{ "logMaxSizeMb": 100 }').logMaxSizeMb, 100);
  assert.equal(parseConfig('{ "logMaxSizeMb": 7 }').logMaxSizeMb, undefined);
});

test("keeps the update check setting only when it is true or false", () => {
  assert.equal(parseConfig('{"checkForUpdates":false}').checkForUpdates, false);
  assert.equal(parseConfig('{"checkForUpdates":true}').checkForUpdates, true);
  assert.equal(parseConfig('{"checkForUpdates":"no"}').checkForUpdates, undefined);
});
