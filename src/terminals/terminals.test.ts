import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSavedTerminal } from "./terminals.ts";

test("reads a saved terminal", () => {
  assert.equal(parseSavedTerminal('{ "terminal": "Ghostty" }'), "Ghostty");
});

test("falls back to Terminal for an unsupported name", () => {
  assert.equal(parseSavedTerminal('{ "terminal": "Notepad" }'), "Terminal");
});

test("falls back to Terminal for broken or empty config", () => {
  assert.equal(parseSavedTerminal("not json"), "Terminal");
  assert.equal(parseSavedTerminal("null"), "Terminal");
  assert.equal(parseSavedTerminal("{}"), "Terminal");
});

test("does not treat inherited object keys as terminals", () => {
  assert.equal(parseSavedTerminal('{ "terminal": "toString" }'), "Terminal");
});
