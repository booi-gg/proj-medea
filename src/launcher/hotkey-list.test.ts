import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { test } from "node:test";
import { listSavedHotkeys, toHotkeyRow, toVisibleRows } from "./hotkey-list.ts";

const entry = { value: "a", name: "Left Half", icon: "▣", run: async () => "" };
const toPlainRow = (...row: Parameters<typeof toHotkeyRow>): string =>
  stripVTControlCharacters(toHotkeyRow(...row));

test("shows the hotkey beside the name", () => {
  assert.match(toPlainRow(entry, "ctrl+option+left"), /^▣\s+Left Half\s+⌃⌥←\s*$/);
});

test("says when an item has no hotkey", () => {
  assert.match(toPlainRow(entry, undefined), /not set\s*$/);
});

test("draws the diagram in place of the icon, and adds any words after the hotkey", () => {
  const row = toPlainRow({ ...entry, diagram: "███   ", hint: "Some words" }, "ctrl+option+left");
  assert.match(row, /^███ {3} Left Half\s+⌃⌥←\s+Some words$/);
});

test("names line up whether or not a row has a diagram", () => {
  const plain = toPlainRow(entry, "ctrl+option+c");
  const drawn = toPlainRow({ ...entry, diagram: "██████" }, "ctrl+option+c");
  assert.equal(plain.indexOf("Left Half"), drawn.indexOf("Left Half"));
});

test("uses the room in a tall window, and never shrinks below the usual list", () => {
  assert.equal(toVisibleRows(50), 34);
  assert.equal(toVisibleRows(24), 8);
  assert.equal(toVisibleRows(10), 8);
});

test("lists apps, commands and Medea items by name", () => {
  const names = listSavedHotkeys({
    "/Applications/Zed.app": "ctrl+cmd+z",
    "command:exit": "ctrl+cmd+e",
    "medea-window:left-half": "ctrl+option+left",
  }).map(({ name }) => name);
  assert.deepEqual(names, ["exit", "Left Half", "Zed"]);
});

test("leaves out a hotkey whose item is gone", () => {
  assert.deepEqual(listSavedHotkeys({ "medea-quicklinks:deleted": "ctrl+cmd+d" }), []);
});
