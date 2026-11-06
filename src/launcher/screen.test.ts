import assert from "node:assert/strict";
import { test } from "node:test";
import { toClearSequence, toWindowTitleSequence } from "./screen.ts";

const CLEAR_SCROLLBACK = "\u001B[3J";

test("a window Medea opened loses its scrollback, so redraws leave no gap", () => {
  assert.ok(toClearSequence(true).endsWith(CLEAR_SCROLLBACK));
});

test("the title bar names the screen", () => {
  assert.equal(toWindowTitleSequence("Clipboard"), "\u001B]0;Medea — Clipboard\u0007");
  assert.equal(toWindowTitleSequence(undefined), "\u001B]0;Medea\u0007");
});

test("a name can't break out of the title bar sequence", () => {
  assert.equal(toWindowTitleSequence("a\u0007\u001B[31mb"), "\u001B]0;Medea — a[31mb\u0007");
});

test("your own terminal keeps its scrollback", () => {
  assert.ok(!toClearSequence(false).includes(CLEAR_SCROLLBACK));
});
