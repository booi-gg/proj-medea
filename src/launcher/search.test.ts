import assert from "node:assert/strict";
import { test } from "node:test";
import { rankItems } from "./search.ts";

const toItems = (...names: string[]) => names.map((name) => ({ name }));
const rankNames = (query: string, ...names: string[]): string[] =>
  rankItems(query, toItems(...names)).map(({ name }) => name);

test("an empty query keeps the original order", () => {
  assert.deepEqual(rankNames("  ", "Zoom", "Arc"), ["Zoom", "Arc"]);
});

test("ranks exact, prefix, word start, then looser matches", () => {
  const names = ["Bobcat", "Big Cat", "Cattle", "Cat"];
  assert.deepEqual(rankNames("cat", ...names), ["Cat", "Cattle", "Big Cat", "Bobcat"]);
});

test("a name starting with the query beats a letter inside another name", () => {
  const ranked = rankNames("v", "Preview", "NordVPN", "Visual Studio Code", "VLC");
  assert.deepEqual(ranked.slice(0, 2), ["Visual Studio Code", "VLC"]);
});

test("initials beat loose letter matches", () => {
  assert.equal(rankNames("vs", "Brave Browser", "Visual Studio Code")[0], "Visual Studio Code");
});

test("finds initials", () => {
  assert.deepEqual(rankNames("vsc", "Safari", "Visual Studio Code"), ["Visual Studio Code"]);
});

test("ignores case and accents", () => {
  assert.deepEqual(rankNames("SAFARI", "Safari"), ["Safari"]);
  assert.deepEqual(rankNames("cafe", "Café"), ["Café"]);
});

test("drops items that do not match", () => {
  assert.deepEqual(rankNames("zzz", "Safari", "Notes"), []);
});

test("keeps original order between items of equal rank", () => {
  assert.deepEqual(rankNames("no", "Notion", "Notes"), ["Notion", "Notes"]);
});
