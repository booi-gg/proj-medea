import assert from "node:assert/strict";
import { test } from "node:test";
import { toClearSequence } from "./screen.ts";

const CLEAR_SCROLLBACK = "\u001B[3J";

test("a window Medea opened loses its scrollback, so redraws leave no gap", () => {
  assert.ok(toClearSequence(true).endsWith(CLEAR_SCROLLBACK));
});

test("your own terminal keeps its scrollback", () => {
  assert.ok(!toClearSequence(false).includes(CLEAR_SCROLLBACK));
});
