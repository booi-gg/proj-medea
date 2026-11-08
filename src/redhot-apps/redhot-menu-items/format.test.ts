import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { test } from "node:test";
import { rankMenuItems, toMenuRow, toPathText, toShortcutText } from "./format.ts";
import type { MenuItem } from "./menu.ts";

const toItem = (path: readonly string[], overrides: Partial<MenuItem> = {}): MenuItem => ({
  path,
  isEnabled: true,
  key: "",
  glyph: 0,
  modifiers: 0,
  ...overrides,
});

const toOption = (path: readonly string[]): { name: string; aliases: string[] } => ({
  name: path.at(-1) ?? "",
  aliases: [toPathText(path)],
});

const rankedNames = (query: string, paths: readonly (readonly string[])[]): string[] =>
  rankMenuItems(query, paths.map(toOption)).map(({ aliases }) => aliases[0] ?? "");

test("a shortcut has cmd unless macOS says otherwise", () => {
  assert.equal(toShortcutText(toItem(["File", "Save"], { key: "s" })), "⌘S");
  assert.equal(toShortcutText(toItem(["Run", "Debug"], { glyph: 115, modifiers: 8 })), "F5");
});

test("modifiers come in the order macOS menus show them", () => {
  const item = toItem(["View", "All"], { key: "A", modifiers: 1 | 2 | 4 });
  assert.equal(toShortcutText(item), "⌃⌥⇧⌘A");
});

test("keys with no letter use the macOS symbol, not the character they send", () => {
  assert.equal(
    toShortcutText(toItem(["File", "Bin"], { key: "\b", glyph: 23, modifiers: 1 })),
    "⇧⌘⌫",
  );
  assert.equal(toShortcutText(toItem(["Go", "Up"], { key: "\uF700", glyph: 104 })), "⌘↑");
  assert.equal(toShortcutText(toItem(["Go", "Tab"], { key: "\t", glyph: 2, modifiers: 12 })), "⌃⇥");
  assert.equal(toShortcutText(toItem(["Go", "Spot"], { key: " " })), "⌘Space");
});

test("an unknown glyph with an unprintable key shows no shortcut", () => {
  assert.equal(toShortcutText(toItem(["Go", "Odd"], { key: "\uF747", glyph: 999 })), "");
});

test("an item with no shortcut shows none, not a lone cmd", () => {
  assert.equal(toShortcutText(toItem(["File", "Export"])), "");
});

test("a row shows the path and puts the shortcut at the right edge", () => {
  const row = stripVTControlCharacters(
    toMenuRow(toItem(["File", "Export", "PDF"], { key: "e", modifiers: 1 }), 30),
  );
  assert.equal(row, `File → Export → PDF${" ".repeat(8)}⇧⌘E`);
  assert.equal(row.length, 30);
});

test("a long path loses its start, so the item itself stays readable", () => {
  const row = stripVTControlCharacters(
    toMenuRow(toItem(["File", "Export Options", "Portable Document Format"]), 30),
  );
  assert.ok(row.startsWith("…"), row);
  assert.ok(row.endsWith("Portable Document Format"), row);
});

test("control characters in another app's titles can't reach the terminal", () => {
  assert.equal(toPathText(["\u001B[31mFile", "Sa\nve"]), "[31mFile → Save");
});

test("words can match different levels of the path", () => {
  assert.deepEqual(
    rankedNames("export pdf", [
      ["File", "Export", "PNG"],
      ["File", "Export", "PDF"],
      ["View", "Show PDF Sidebar"],
    ]),
    ["File → Export → PDF"],
  );
});

test("a match in the item's own title beats one in the menus above it", () => {
  assert.deepEqual(
    rankedNames("export", [
      ["File", "Export", "PNG"],
      ["File", "Export…"],
    ]),
    ["File → Export…", "File → Export → PNG"],
  );
});

test("letters scattered across a title don't count as a match", () => {
  assert.deepEqual(rankedNames("fie", [["File", "Find Next"]]), []);
});

test("an empty search keeps the menu's own order", () => {
  assert.deepEqual(
    rankedNames("  ", [
      ["File", "New"],
      ["Edit", "Copy"],
    ]),
    ["File → New", "Edit → Copy"],
  );
});
