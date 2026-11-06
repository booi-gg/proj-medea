import assert from "node:assert/strict";
import { test } from "node:test";
import { parseConfig } from "./config.ts";

test("reads the terminal and aliases", () => {
  const config = parseConfig('{ "terminal": "Ghostty", "aliases": { "/a.app": ["a", "b"] } }');
  assert.deepEqual(config, { terminal: "Ghostty", aliases: { "/a.app": ["a", "b"] } });
});

test("broken or empty config reads as empty", () => {
  for (const text of ["not json", "null", "[]", "3"]) {
    assert.deepEqual(parseConfig(text), { aliases: {} });
  }
});

test("ignores malformed aliases", () => {
  const config = parseConfig('{ "aliases": { "/a.app": "nope", "/b.app": [1], "/c.app": ["c"] } }');
  assert.deepEqual(config.aliases, { "/c.app": ["c"] });
});

test("a config from before aliases still works", () => {
  assert.deepEqual(parseConfig('{ "terminal": "Terminal" }'), {
    terminal: "Terminal",
    aliases: {},
  });
});
