import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "./config.ts";

test("reads the terminal and aliases", () => {
  const config = parseConfig(
    '{ "terminal": "Ghostty", "aliases": { "/a.app": ["a", "b"] }, "hotkeys": { "/a.app": "shift+cmd+k" } }',
  );
  assert.deepEqual(config, {
    terminal: "Ghostty",
    aliases: { "/a.app": ["a", "b"] },
    hotkeys: { "/a.app": "shift+cmd+k" },
  });
});

test("broken or empty config reads as empty", () => {
  for (const text of ["not json", "null", "[]", "3"]) {
    assert.deepEqual(parseConfig(text), { aliases: {}, hotkeys: {} });
  }
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
    terminal: "Terminal",
    aliases: {},
    hotkeys: {},
  });
});
