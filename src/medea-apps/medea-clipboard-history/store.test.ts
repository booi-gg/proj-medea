import assert from "node:assert/strict";
import { test } from "node:test";
import { addEntry, parseEntries, readPngSize } from "./store.ts";
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

test("keeps at most 200 entries, dropping the oldest", () => {
  let entries: ReturnType<typeof addEntry> = [first];
  for (let index = 0; index < 250; index += 1) {
    entries = addEntry(entries, toText(`text ${index}`, index));
  }
  assert.equal(entries.length, 200);
  assert.deepEqual(entries[0], toText("text 249", 249));
  assert.deepEqual(entries.at(-1), toText("text 50", 50));
});

test("keeps at most 50 images, and text isn't pushed out by them", () => {
  let entries: ReturnType<typeof addEntry> = [first];
  for (let index = 0; index < 60; index += 1) {
    entries = addEntry(entries, toImage(`hash-${index}`, index));
  }
  const images = entries.filter((entry) => entry.kind === "image");
  assert.equal(images.length, 50);
  assert.deepEqual(images[0], toImage("hash-59", 59));
  assert.deepEqual(entries.at(-1), first);
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
