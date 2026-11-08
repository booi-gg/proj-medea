import assert from "node:assert/strict";
import { test } from "node:test";
import { WEB_SEARCH_FALLBACK_VALUE } from "../redhot-apps/redhot-web-search/index.ts";
import { rankWithAnswers } from "./launcher.ts";
import type { LauncherOption } from "./prompt.ts";

const SAFARI: LauncherOption = {
  value: "/Applications/Safari.app",
  name: "Safari",
  aliases: [],
  label: "Safari",
};

test("search offers the web only when nothing matches", () => {
  const values = rankWithAnswers("zzqxqzx wvvkj", [SAFARI]).map(({ value }) => value);
  assert.ok(values.includes(WEB_SEARCH_FALLBACK_VALUE));
});

test("with no matches focus starts on a line Enter can't run, with the web one row down", () => {
  const [first, second] = rankWithAnswers("zzqxqzx wvvkj", [SAFARI]);
  assert.equal(first?.isInert, true);
  assert.equal(first?.footer, "↓ search the web");
  assert.equal(second?.value, WEB_SEARCH_FALLBACK_VALUE);
  assert.notEqual(second?.isInert, true);
});

test("search keeps the web out of the way when something matches", () => {
  const values = rankWithAnswers("safari", [SAFARI]).map(({ value }) => value);
  assert.deepEqual(values, [SAFARI.value]);
});

test("an answer counts as finding something", () => {
  const values = rankWithAnswers("2 * (4 + 1)", [SAFARI]).map(({ value }) => value);
  assert.ok(!values.includes(WEB_SEARCH_FALLBACK_VALUE));
  assert.equal(values.length, 1);
});
