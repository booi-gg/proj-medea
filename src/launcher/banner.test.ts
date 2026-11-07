import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { renderBanner } from "./banner.ts";

const toVisibleRows = (banner: string): string[] =>
  stripVTControlCharacters(banner).split("\n").filter(Boolean);

test("draws the logo when the window is wide enough", () => {
  const rows = toVisibleRows(renderBanner(80));
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.length <= 80));
});

test("every logo row has the same width", () => {
  const widths = new Set(toVisibleRows(renderBanner(80)).map((row) => row.length));
  assert.equal(widths.size, 1);
});

test("falls back to the plain name in a narrow window", () => {
  assert.deepEqual(toVisibleRows(renderBanner(10)), ["  redhot"]);
});

test("fades smoothly from mild red to hot red with full RGB colour", () => {
  const banner = renderBanner(80, undefined, true);
  assert.ok(banner.indexOf("\u001B[38;2;235;100;95m") < banner.indexOf("\u001B[38;2;235;25;25m"));
});

test("gives each letter one colour without full RGB colour", () => {
  const [firstRow = ""] = renderBanner(80, undefined, false).split("\n").filter(Boolean);
  const [, ...bands] = firstRow.split("\u001B[38;5;");
  const colors = bands.map((band) => Number.parseInt(band, 10));
  const letters = bands.map((band) => stripVTControlCharacters(`\u001B[38;5;${band}`));
  assert.deepEqual(letters, ["█▀█ ", "█▀▀ ", "█▀▄ ", "█ █ ", "█▀█ ", "▀█▀"]);
  assert.equal(colors[0], 210);
  assert.equal(colors.at(-1), 196);
});

test("puts sync status beside the logo without wrapping it", () => {
  const rows = toVisibleRows(renderBanner(80, "Last sync 4m ago"));
  assert.equal(rows[0]?.trimEnd().endsWith("Last sync 4m ago"), true);
  assert.ok(rows.every((row) => row.length <= 80));
  assert.ok(!toVisibleRows(renderBanner(20, "Last sync 4m ago")).join(" ").includes("Last sync"));
});
