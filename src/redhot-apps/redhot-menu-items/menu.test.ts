import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAppMenu, toPressRequest } from "./menu.ts";
import type { MenuItem } from "./menu.ts";

const item = (path: readonly string[], isEnabled = true): MenuItem => ({
  path,
  isEnabled,
  key: "",
  glyph: 0,
  modifiers: 0,
});

const reply = (items: readonly unknown[]): string =>
  JSON.stringify({ app: "Safari", pid: 42, isPartial: false, items });

test("reads the helper's list", () => {
  const export_ = item(["File", "Export", "PDF"]);
  assert.deepEqual(parseAppMenu(reply([export_])), {
    app: "Safari",
    pid: 42,
    isPartial: false,
    items: [export_],
  });
});

test("anything else isn't a list", () => {
  assert.equal(parseAppMenu("failed"), undefined);
  assert.equal(parseAppMenu('{"app":"Safari"}'), undefined);
  assert.equal(parseAppMenu(reply([{ path: "File" }])), undefined);
});

test("a repeated path becomes one row, in the place it first appeared", () => {
  const items = [item(["Window", "Quarters"], false), item(["Window", "Zoom"])];
  const parsed = parseAppMenu(reply([...items, item(["Window", "Quarters"], false)]));
  assert.deepEqual(parsed?.items, items);
});

test("a repeated path keeps the enabled copy, because that's the one a press finds", () => {
  const enabled = item(["Edit", "Paste and Match Style"]);
  const parsed = parseAppMenu(reply([item(["Edit", "Paste and Match Style"], false), enabled]));
  assert.deepEqual(parsed?.items, [enabled]);
});

test("a press names the app and survives spaces in titles", () => {
  const [command, action, pid, encoded] = toPressRequest(42, ["File", "Save As…"]).split(" ");
  assert.deepEqual([command, action, pid], ["menu-items", "press", "42"]);
  assert.deepEqual(JSON.parse(Buffer.from(encoded ?? "", "base64").toString()), [
    "File",
    "Save As…",
  ]);
});
