import assert from "node:assert/strict";
import { test } from "node:test";
import { addRecent, parseRecents } from "./recents.ts";

test("a new pick goes first", () => {
  assert.deepEqual(addRecent(["🔥"], "⌘"), ["⌘", "🔥"]);
});

test("picking one again moves it instead of listing it twice", () => {
  assert.deepEqual(addRecent(["⌘", "🔥", "©"], "🔥"), ["🔥", "⌘", "©"]);
});

test("the list stops growing and drops the oldest", () => {
  const full = Array.from({ length: 24 }, (_, index) => String(index));
  const updated = addRecent(full, "new");
  assert.equal(updated.length, 24);
  assert.equal(updated[0], "new");
  assert.ok(!updated.includes("23"));
});

test("a file that isn't a list of text reads as nothing useful", () => {
  assert.deepEqual(parseRecents('{"a":1}'), []);
  assert.deepEqual(parseRecents('["🔥",3,null]'), ["🔥"]);
});
