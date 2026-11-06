import assert from "node:assert/strict";
import { test } from "node:test";
import { addEntry, parseEntries } from "./store.ts";

const entry = { id: "1", text: "first", copiedAt: 1 };

test("puts the newest entry first", () => {
  assert.deepEqual(addEntry([entry], "second", 2, "2"), [
    { id: "2", text: "second", copiedAt: 2 },
    entry,
  ]);
});

test("copying the same text again moves it to the top", () => {
  const older = { id: "2", text: "second", copiedAt: 2 };
  assert.deepEqual(addEntry([older, entry], "first", 3, "3"), [
    { id: "3", text: "first", copiedAt: 3 },
    older,
  ]);
});

test("skips blank text", () => {
  assert.deepEqual(addEntry([entry], " \n ", 2, "2"), [entry]);
});

test("skips very large text", () => {
  assert.deepEqual(addEntry([entry], "x".repeat(100_001), 2, "2"), [entry]);
});

test("keeps at most 200 entries, dropping the oldest", () => {
  let entries = [entry];
  for (let index = 0; index < 250; index += 1) {
    entries = addEntry(entries, `text ${index}`, index, String(index));
  }
  assert.equal(entries.length, 200);
  assert.equal(entries[0]?.text, "text 249");
  assert.equal(entries.at(-1)?.text, "text 50");
});

test("broken history reads as empty", () => {
  assert.deepEqual(parseEntries("{ not json"), []);
  assert.deepEqual(parseEntries("{}"), []);
});

test("skips broken entries", () => {
  assert.deepEqual(parseEntries(JSON.stringify([entry, { id: "x" }])), [entry]);
});
