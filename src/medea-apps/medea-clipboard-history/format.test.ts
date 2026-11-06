import assert from "node:assert/strict";
import { test } from "node:test";
import stringWidth from "string-width";
import { formatAge, formatSize, toPreview, toPreviewLines, toSafeText } from "./format.ts";

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

test("wraps a long sentence so all of it can be read", () => {
  const sentence = "Quicklinks now take input through a prompt after Enter, so this works.";
  const lines = toPreviewLines(sentence, 30, 10);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(" ").replaceAll(/\s+/g, " "), sentence);
  assert.ok(lines.every((line) => stringWidth(line) <= 30));
});

test("breaks at spaces, not inside words", () => {
  assert.deepEqual(toPreviewLines("one two three", 8, 10), ["one two", "three"]);
});

test("breaks a word longer than the pane", () => {
  assert.deepEqual(toPreviewLines("abcdefghij", 5, 10), ["abcde", "fghij"]);
});

test("keeps indentation when wrapping", () => {
  assert.equal(toPreviewLines("    return value;", 40, 10)[0], "    return value;");
});

test("wraps wide characters by their real width", () => {
  const lines = toPreviewLines("日本語のテキストです", 8, 10);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((line) => stringWidth(line) <= 8));
});

test("counts wrapped lines towards the hidden total", () => {
  const lines = toPreviewLines("aaaa bbbb cccc dddd", 4, 3);
  assert.deepEqual(lines.slice(0, 2), ["aaaa", "bbbb"]);
  assert.ok(lines[2]?.includes("2 more lines"));
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

test("colours go on after the text is wrapped to fit", () => {
  const seen: string[] = [];
  const colorize = (text: string): string => {
    seen.push(text);
    return text.toUpperCase();
  };
  assert.deepEqual(toPreviewLines("abcdefghij\nxy", 5, 10, colorize), ["ABCDE", "FGHIJ", "XY"]);
  assert.deepEqual(seen, ["abcde\nfghij\nxy"]);
});

test("the note about hidden lines isn't coloured as code", () => {
  const lines = toPreviewLines("1\n2\n3\n4", 40, 2, (text) => `<${text}>`);
  assert.equal(lines[0], "<1>");
  assert.ok(lines[1]?.includes("3 more lines"));
});

test("falls back to plain lines if colouring changes the line count", () => {
  assert.deepEqual(
    toPreviewLines("one\ntwo", 40, 10, () => "merged"),
    ["one", "two"],
  );
});

test("safe text keeps tabs and lines, and removes escape codes", () => {
  assert.equal(toSafeText("a\tb\r\nc\u001B[2J\u0007"), "a\tb\nc[2J");
});
