import assert from "node:assert/strict";
import { test } from "node:test";
import { toTerminalName } from "./terminals.ts";

test("keeps a supported terminal", () => {
  assert.equal(toTerminalName("Ghostty"), "Ghostty");
});

test("falls back to Terminal for an unsupported or missing name", () => {
  assert.equal(toTerminalName("Notepad"), "Terminal");
  assert.equal(toTerminalName(undefined), "Terminal");
});

test("does not treat inherited object keys as terminals", () => {
  assert.equal(toTerminalName("toString"), "Terminal");
});
