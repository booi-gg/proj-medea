import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAge, formatSize, toPreview, toPreviewLines } from "./format.ts";

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

test("keeps a code block's lines and indentation", () => {
  const code = "function add(a, b) {\n  return a + b;\n}\n";
  assert.deepEqual(toPreviewLines(code, 40, 10), ["function add(a, b) {", "  return a + b;", "}"]);
});

test("keeps blank lines inside the text", () => {
  assert.deepEqual(toPreviewLines("one\n\nthree", 40, 10), ["one", "", "three"]);
});

test("reads Windows line endings", () => {
  assert.deepEqual(toPreviewLines("one\r\ntwo", 40, 10), ["one", "two"]);
});

test("shows tabs as spaces, because a tab's width would break the layout", () => {
  assert.deepEqual(toPreviewLines("\tindented", 40, 10), ["    indented"]);
});

test("cuts a long line instead of wrapping it", () => {
  assert.deepEqual(toPreviewLines("abcdefghij", 5, 10), ["abcd…"]);
});

test("says how many lines don't fit", () => {
  const lines = toPreviewLines("1\n2\n3\n4\n5", 40, 3);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.slice(0, 2), ["1", "2"]);
  assert.ok(lines[2]?.includes("3 more lines"));
});

test("text that exactly fits needs no note", () => {
  assert.deepEqual(toPreviewLines("1\n2\n3", 40, 3), ["1", "2", "3"]);
});

test("strips escape codes from the preview", () => {
  assert.deepEqual(toPreviewLines("safe\u001B[2Jtext\nnext\u0007", 40, 10), [
    "safe[2Jtext",
    "next",
  ]);
});

test("formats file sizes", () => {
  assert.equal(formatSize(100), "1 KB");
  assert.equal(formatSize(340_000), "340 KB");
  assert.equal(formatSize(2_500_000), "2.5 MB");
});
