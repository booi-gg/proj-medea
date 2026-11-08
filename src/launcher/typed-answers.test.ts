import assert from "node:assert/strict";
import { test } from "node:test";
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

test("the calculator isn't confused by a date sum", () => {
  assert.ok(!valuesFor("today + 90 days").includes("redhot-calculator:answer"));
});

test("a plain sum is still the calculator's", () => {
  assert.deepEqual(valuesFor("2 + 2"), ["redhot-calculator:answer"]);
});

test("the answer's copy goes through its own row", () => {
  const [row] = rankWithAnswers("5 km in miles", NO_OPTIONS);
  assert.ok(row?.label.includes("5 km = 3.1069 mi"));
  assert.equal(row?.footer, "↵ copy");
});
