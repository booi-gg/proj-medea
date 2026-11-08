import assert from "node:assert/strict";
import { test } from "node:test";
import { addToHistory, parseHistory } from "./history.ts";

test("a new colour goes first", () => {
  assert.deepEqual(addToHistory(["#000000"], "#FFFFFF"), ["#FFFFFF", "#000000"]);
});

test("picking one again moves it instead of listing it twice", () => {
  assert.deepEqual(addToHistory(["#111111", "#222222", "#333333"], "#222222"), [
    "#222222",
    "#111111",
    "#333333",
  ]);
});

test("the history stops growing and drops the oldest", () => {
  const full = Array.from(
    { length: 12 },
    (_, index) => `#0000${index.toString(16).padStart(2, "0").toUpperCase()}`,
  );
  const updated = addToHistory(full, "#FFFFFF");
  assert.equal(updated.length, 12);
  assert.equal(updated[0], "#FFFFFF");
  assert.ok(!updated.includes("#00000B"));
});

test("anything that isn't a colour is ignored", () => {
  assert.deepEqual(parseHistory('{"a":1}'), []);
  assert.deepEqual(parseHistory('["#FF5733","red",3,null]'), ["#FF5733"]);
});
