import assert from "node:assert/strict";
import { test } from "node:test";
import { parseEmojiData, rankEmoji, withRecentsFirst } from "./catalog.ts";
import type { EmojiEntry } from "./catalog.ts";
import { EMOJI_DATA } from "./data.ts";

const entries = parseEmojiData(EMOJI_DATA);

const toOptions = (list: readonly EmojiEntry[]): { name: string; aliases: readonly string[] }[] =>
  list.map(({ name, keywords }) => ({ name, aliases: keywords }));

const topName = (query: string): string | undefined =>
  rankEmoji(query, toOptions(entries))[0]?.name;

const findName = (character: string): string | undefined =>
  entries.find((entry) => entry.character === character)?.name;

test("the bundled list has the emoji and symbols people look for", () => {
  assert.equal(findName("🔥"), "fire");
  assert.equal(findName("⌘"), "command key");
  assert.equal(findName("→"), "right-pointing arrow");
  assert.equal(findName("©️"), "copyright");
});

test("each character is listed once, so its row can be told apart from the others", () => {
  const characters = entries.map(({ character }) => character);
  assert.equal(new Set(characters).size, characters.length);
});

test("skin tone variants and plain keyboard characters are left out", () => {
  assert.equal(findName("👍🏽"), undefined);
  assert.equal(findName("#"), undefined);
});

test("an exact name comes before anything that only has it as a keyword", () => {
  assert.equal(topName("fire"), "fire");
});

test("a keyword finds an emoji whose name doesn't have it", () => {
  const names = rankEmoji("flame", toOptions(entries)).map(({ name }) => name);
  assert.ok(names.includes("fire"));
});

test("letters scattered across a name don't count as a match", () => {
  assert.deepEqual(rankEmoji("fxqz", toOptions(entries)), []);
  const scattered = [{ name: "flag: Martinique", aliases: [] }];
  assert.deepEqual(rankEmoji("fmqe", scattered), []);
});

test("recent picks come first, newest first, and aren't listed twice", () => {
  const list = [
    { character: "a", name: "first", keywords: [] },
    { character: "b", name: "second", keywords: [] },
    { character: "c", name: "third", keywords: [] },
  ];
  const ordered = withRecentsFirst(list, ["c", "gone", "b"]);
  assert.deepEqual(
    ordered.map(({ character }) => character),
    ["c", "b", "a"],
  );
});

test("a recent pick wins a tie in search", () => {
  const options = [
    { name: "red heart", aliases: [] },
    { name: "blue heart", aliases: [] },
  ];
  const [recent, other] = options;
  assert.ok(recent !== undefined && other !== undefined);
  assert.equal(rankEmoji("heart", [other, recent])[0], other);
  assert.equal(rankEmoji("heart", [recent, other])[0], recent);
});
