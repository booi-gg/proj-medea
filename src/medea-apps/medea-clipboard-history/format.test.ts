import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAge, toPreview } from "./format.ts";

test("puts several lines on one", () => {
  assert.equal(toPreview("  one\n\n  two\tthree ", 40), "one two three");
});

test("cuts long text with an ellipsis", () => {
  assert.equal(toPreview("abcdefghij", 5), "abcd…");
});

test("leaves text that fits exactly", () => {
  assert.equal(toPreview("abcde", 5), "abcde");
});

test("strips escape codes so they can't run in the terminal", () => {
  assert.equal(toPreview("safe\u001B[2Jtext\u0007", 40), "safe[2Jtext");
});

test("formats age", () => {
  const minute = 60_000;
  assert.equal(formatAge(0, 59_000), "now");
  assert.equal(formatAge(0, 5 * minute), "5m");
  assert.equal(formatAge(0, 3 * 60 * minute), "3h");
  assert.equal(formatAge(0, 2 * 24 * 60 * minute), "2d");
});
