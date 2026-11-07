import assert from "node:assert/strict";
import { test } from "node:test";
import { addEntry, keepRecentEntries, parseEntries, readPngSize, toImageName } from "./store.ts";
import type { ImageEntry, TextEntry } from "./store.ts";

const toText = (text: string, copiedAt = 1): TextEntry => ({
  kind: "text",
  id: `text-${text}-${copiedAt}`,
  text,
  copiedAt,
});

const toImage = (hash: string, copiedAt = 1): ImageEntry => ({
  kind: "image",
  id: `image-${hash}-${copiedAt}`,
  hash,
  width: 10,
  height: 20,
  bytes: 300,
  copiedAt,
});

const first = toText("first");

test("keeps an image's name when the same image is copied again without one", () => {
  const named = { ...toImage("same", 1), name: "cat.png" };
  const again = toImage("same", 2);
  assert.deepEqual(addEntry([named], again), [{ ...again, name: "cat.png" }]);
});

test("a new name replaces the one an image had", () => {
  const named = { ...toImage("same", 1), name: "cat.png" };
  const renamed = { ...toImage("same", 2), name: "dog.png" };
  assert.deepEqual(addEntry([named], renamed), [renamed]);
});

test("an image doesn't take the name of a different image", () => {
  const named = { ...toImage("one", 1), name: "cat.png" };
  const other = toImage("two", 2);
  assert.deepEqual(addEntry([named], other), [other, named]);
});

test("reads an image's name, and images saved before names existed", () => {
  const named = { ...toImage("one"), name: "cat.png" };
  const unnamed = toImage("two");
  assert.deepEqual(parseEntries(JSON.stringify([named, unnamed])), [named, unnamed]);
});

test("ignores an image name that isn't text", () => {
  const image = toImage("one");
  assert.deepEqual(parseEntries(JSON.stringify([{ ...image, name: 42 }])), [image]);
});

test("removes escape codes and line breaks from an image's name", () => {
  assert.equal(toImageName("cat\u001b[31m\n.png"), "cat[31m .png");
});

test("treats a blank image name as no name", () => {
  assert.equal(toImageName("  \n "), undefined);
  assert.equal(toImageName(undefined), undefined);
});

test("puts the newest entry first", () => {
  const second = toText("second", 2);
  assert.deepEqual(addEntry([first], second), [second, first]);
});

test("copying the same text again moves it to the top", () => {
  const older = toText("second", 2);
  const again = toText("first", 3);
  assert.deepEqual(addEntry([older, first], again), [again, older]);
});

test("copying the same image again moves it to the top", () => {
  const older = toImage("a");
  const other = toImage("b", 2);
  const again = toImage("a", 3);
  assert.deepEqual(addEntry([other, older], again), [again, other]);
});

test("an image never counts as the same as text", () => {
  const image = toImage("first", 2);
  assert.deepEqual(addEntry([first], image), [image, first]);
});

test("skips blank text", () => {
  assert.deepEqual(addEntry([first], toText(" \n ")), [first]);
});

test("skips very large text", () => {
  assert.deepEqual(addEntry([first], toText("x".repeat(100_001))), [first]);
});

test("keeps at most 5,000 entries, dropping the oldest", () => {
  const entries = Array.from({ length: 5000 }, (_, index) => toText(`text ${index}`, index));
  const newest = toText("newest", 6000);
  const kept = addEntry(entries, newest);
  assert.equal(kept.length, 5000);
  assert.equal(kept[0], newest);
  assert.equal(kept.at(-1), entries.at(-2));
});

test("drops the oldest images past 2 GB, and text isn't pushed out by them", () => {
  const big = (hash: string, copiedAt: number): ImageEntry => ({
    ...toImage(hash, copiedAt),
    bytes: 900_000_000,
  });
  const entries = [big("second", 3), first, big("first", 2), big("oldest", 1)];
  const newest = toText("newest", 4);
  assert.deepEqual(addEntry(entries, newest), [newest, big("second", 3), first, big("first", 2)]);
});

test("drops the oldest text past 20 million characters", () => {
  const toLongText = (index: number): TextEntry => toText(`${index}`.padEnd(100_000), index);
  const entries = Array.from({ length: 200 }, (_, index) => toLongText(200 - index));
  const newest = toLongText(201);
  assert.deepEqual(addEntry(entries, newest), [newest, ...entries.slice(0, -1)]);
});

const NOW = new Date(2026, 5, 15, 12).getTime();
const monthsBefore = (months: number, extraMs = 0): number =>
  new Date(2026, 5 - months, 15, 12).getTime() + extraMs;

test("keeps entries from the chosen number of months, and drops older ones", () => {
  const onTheLimit = toText("on the limit", monthsBefore(3));
  const tooOld = toText("too old", monthsBefore(3, -1));
  const recent = toImage("recent", monthsBefore(1));
  assert.deepEqual(keepRecentEntries([recent, onTheLimit, tooOld], 3, NOW), [recent, onTheLimit]);
});

test("a longer history keeps what a shorter one drops", () => {
  const entry = toText("old", monthsBefore(4));
  assert.deepEqual(keepRecentEntries([entry], 3, NOW), []);
  assert.deepEqual(keepRecentEntries([entry], 5, NOW), [entry]);
});

test("broken history reads as empty", () => {
  assert.deepEqual(parseEntries("{ not json"), []);
  assert.deepEqual(parseEntries("{}"), []);
});

test("skips broken entries", () => {
  assert.deepEqual(parseEntries(JSON.stringify([first, { id: "x" }])), [first]);
});

test("reads text entries saved before images existed", () => {
  const saved = JSON.stringify([{ id: "1", text: "old", copiedAt: 1 }]);
  assert.deepEqual(parseEntries(saved), [{ kind: "text", id: "1", text: "old", copiedAt: 1 }]);
});

test("reads image entries back", () => {
  const image = toImage("a");
  assert.deepEqual(parseEntries(JSON.stringify([image])), [image]);
});

test("reads a PNG's size", () => {
  const png = Buffer.alloc(24);
  png.write("89504e470d0a1a0a", "hex");
  png.writeUInt32BE(1200, 16);
  png.writeUInt32BE(800, 20);
  assert.deepEqual(readPngSize(png), { width: 1200, height: 800 });
});

test("rejects data that isn't a PNG", () => {
  assert.equal(readPngSize(Buffer.alloc(24)), undefined);
  assert.equal(readPngSize(Buffer.from("short")), undefined);
});
