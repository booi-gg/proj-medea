import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_NAME } from "../paths.ts";
import { formatSyncLabel, toClearSequence, toWindowTitleSequence } from "./screen.ts";

const CLEAR_SCROLLBACK = "\u001B[3J";

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
