import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFINE_VALUE, toDictionaryItem } from "../redhot-apps/redhot-dictionary/index.ts";
import type { LauncherItem } from "../redhot-apps/types.ts";
import { WEB_SEARCH_FALLBACK_VALUE } from "../redhot-apps/redhot-web-search/index.ts";
import { rankWithAnswers } from "./launcher.ts";
import type { LauncherOption } from "./prompt.ts";

const NO_OPTIONS: readonly LauncherOption[] = [];

const valuesFor = (query: string): string[] =>
  rankWithAnswers(query, NO_OPTIONS).map(({ value }) => value);

test("a unit conversion comes first in search", () => {
  assert.deepEqual(valuesFor("5 km in miles"), ["redhot-units:answer"]);
});

test("a unit conversion that also looks like a currency one is only a unit conversion", () => {
  assert.deepEqual(valuesFor("5 miles to km"), ["redhot-units:answer"]);
});

test("time zone and date questions come first in search", () => {
  assert.deepEqual(valuesFor("time in London"), ["redhot-time:zone"]);
  assert.deepEqual(valuesFor("today + 90 days"), ["redhot-time:date"]);
});

test("a timer comes first in search, and Enter starts it", () => {
  const [row] = rankWithAnswers("timer 25m", NO_OPTIONS);
  assert.equal(row?.value, "redhot-timer:start");
  assert.equal(row?.name, "Timer for 25 minutes");
  assert.equal(row?.footer, "↵ start");
});

test("the calculator isn't confused by a date sum", () => {
  assert.ok(!valuesFor("today + 90 days").includes("redhot-calculator:answer"));
});

test("a plain sum is still the calculator's", () => {
  assert.deepEqual(valuesFor("2 + 2"), ["redhot-calculator:answer"]);
});

const toDefineRow = (query: string): LauncherItem[] =>
  [toDictionaryItem(query, ["define"])].filter((item) => item !== undefined);

test("a definition comes first, with the web still on offer below it", () => {
  const query = "define zzqxqzx";
  const values = rankWithAnswers(query, NO_OPTIONS, toDefineRow(query)).map(({ value }) => value);
  assert.deepEqual(values, [DEFINE_VALUE, WEB_SEARCH_FALLBACK_VALUE]);
});

test("the web isn't offered under a definition when something else matches", () => {
  const safari: LauncherOption = { value: "safari", name: "define zz", aliases: [], label: "x" };
  const query = "define zz";
  const values = rankWithAnswers(query, [safari], toDefineRow(query)).map(({ value }) => value);
  assert.deepEqual(values, [DEFINE_VALUE, "safari"]);
});

test("the answer's copy goes through its own row", () => {
  const [row] = rankWithAnswers("5 km in miles", NO_OPTIONS);
  assert.ok(row?.label.includes("5 km = 3.1069 mi"));
  assert.equal(row?.footer, "↵ copy");
});
