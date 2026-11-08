import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters, styleText } from "node:util";
import { APP_NAME } from "../paths.ts";
import {
  formatSyncLabel,
  renderTitle,
  toClearSequence,
  toTerminalWidth,
  toWindowTitleSequence,
} from "./screen.ts";

const CLEAR_SCROLLBACK = "\u001B[3J";
const WINDOW_COLUMNS = 80;
const WHITE_LABEL_RED_TEXT = "\u001B[48;5;231m\u001B[38;5;160m";
const WHITE_LINE = "\u001B[38;5;231m─";

const toVisibleTitle = (title: string, columns: number | undefined, icon?: string): string =>
  stripVTControlCharacters(renderTitle({ title, icon }, columns)).trimEnd();

test("the title is a solid label with the icon inside it, and a line to the right margin", () => {
  const title = renderTitle({ title: "Clipboard", icon: "≡" }, WINDOW_COLUMNS);
  assert.ok(title.includes(`${WHITE_LABEL_RED_TEXT} ≡ Clipboard \u001B[39;49m`));
  assert.ok(title.includes(WHITE_LINE));
  const visible = toVisibleTitle("Clipboard", WINDOW_COLUMNS, "≡");
  assert.match(visible, /^ {3}≡ Clipboard {2}─+$/u);
  assert.equal(toTerminalWidth(visible), WINDOW_COLUMNS - 2);
});

test("a coloured icon loses its colour, so its reset can't turn the title white on white", () => {
  const icon = styleText("red", "≡", { validateStream: false });
  const title = renderTitle({ title: "Clipboard", icon }, WINDOW_COLUMNS);
  assert.ok(!title.includes(icon));
  assert.ok(title.includes("≡ Clipboard"));
});

test("a screen without an icon still gets a label", () => {
  assert.match(toVisibleTitle("Add Alias", WINDOW_COLUMNS), /^ {3}Add Alias {2}─+$/u);
});

test("a long title stays on one row and ends with an ellipsis", () => {
  const visible = toVisibleTitle("Create Hotkey for ".repeat(10), WINDOW_COLUMNS, "≡");
  assert.ok(toTerminalWidth(visible) <= WINDOW_COLUMNS);
  assert.ok(visible.endsWith("…"));
  assert.equal(renderTitle({ title: "x".repeat(200) }, WINDOW_COLUMNS).split("\n").length, 2);
});

test("a window narrower than the title doesn't wrap", () => {
  assert.ok(toTerminalWidth(toVisibleTitle("Clipboard", 10)) <= 10);
});

test("with no known width there's no line, and nothing is cut", () => {
  assert.equal(toVisibleTitle("Clipboard", undefined), "   Clipboard");
});

test("a window Redhot opened loses its scrollback, so redraws leave no gap", () => {
  assert.ok(toClearSequence(true).endsWith(CLEAR_SCROLLBACK));
});

test("the title bar names the screen", () => {
  assert.equal(toWindowTitleSequence("Clipboard"), `\u001B]0;${APP_NAME} — Clipboard\u0007`);
  assert.equal(toWindowTitleSequence(undefined), `\u001B]0;${APP_NAME}\u0007`);
});

test("a name can't break out of the title bar sequence", () => {
  assert.equal(toWindowTitleSequence("a\u0007\u001B[31mb"), `\u001B]0;${APP_NAME} — a[31mb\u0007`);
});

test("your own terminal keeps its scrollback", () => {
  assert.ok(!toClearSequence(false).includes(CLEAR_SCROLLBACK));
});

test("formats the last successful sync for the launcher header", () => {
  const status = {
    enabled: true,
    paused: false,
    settingsEnabled: true,
    quicklinksEnabled: true,
    snippetsEnabled: false,
    logsEnabled: true,
    conflicts: 0,
    pending: 0,
  };
  assert.equal(formatSyncLabel(status), "Sync pending");
  assert.equal(
    formatSyncLabel(
      { ...status, lastSyncAt: "2026-11-07T00:00:00Z" },
      Date.parse("2026-11-07T00:04:00Z"),
    ),
    "Last sync 4m ago",
  );
  assert.equal(formatSyncLabel({ ...status, paused: true }), "Sync paused");
  assert.equal(formatSyncLabel({ ...status, error: "offline" }), "Sync issue");
});
