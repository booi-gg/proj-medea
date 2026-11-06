import assert from "node:assert/strict";
import { test } from "node:test";
import { rankItems } from "./search.ts";

const toItems = (...names: string[]) => names.map((name) => ({ name }));
const rankNames = (query: string, ...names: string[]): string[] =>
  rankItems(query, toItems(...names)).map(({ name }) => name);

test("an empty query keeps the original order", () => {
  assert.deepEqual(rankNames("  ", "Zoom", "Arc"), ["Zoom", "Arc"]);
});

test("ranks exact, prefix, word start, substring, then in-order letters", () => {
  const names = ["Copy Art", "Bobcat", "Big Cat", "Cattle", "Cat"];
  assert.deepEqual(rankNames("cat", ...names), ["Cat", "Cattle", "Big Cat", "Bobcat", "Copy Art"]);
});

test("finds initials through in-order letters", () => {
  assert.deepEqual(rankNames("vsc", "Safari", "Visual Studio Code"), ["Visual Studio Code"]);
});

test("ignores case", () => {
  assert.deepEqual(rankNames("SAFARI", "Safari"), ["Safari"]);
});

test("drops items that do not match", () => {
  assert.deepEqual(rankNames("zzz", "Safari", "Notes"), []);
});

test("keeps original order between items of equal rank", () => {
  assert.deepEqual(rankNames("no", "Notes", "Notion"), ["Notes", "Notion"]);
});
