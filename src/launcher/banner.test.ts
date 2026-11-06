import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { renderBanner } from "./banner.ts";

const toVisibleRows = (banner: string): string[] =>
  stripVTControlCharacters(banner).split("\n").filter(Boolean);

test("draws the logo when the window is wide enough", () => {
  const rows = toVisibleRows(renderBanner(80));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.length <= 80));
});

test("every logo row has the same width", () => {
  const widths = new Set(toVisibleRows(renderBanner(80)).map((row) => row.length));
  assert.equal(widths.size, 1);
});

test("falls back to the plain name in a narrow window", () => {
  assert.deepEqual(toVisibleRows(renderBanner(20)), ["  supercast"]);
});

test("fades from teal to cyan", () => {
  const banner = renderBanner(80);
  assert.ok(banner.indexOf("\u001B[38;5;30m") < banner.indexOf("\u001B[38;5;51m"));
});
