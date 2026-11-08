import assert from "node:assert/strict";
import { test } from "node:test";
import { toDictionaryItem } from "./index.ts";

const PHRASES = ["define", "what is"];

test("there's no row when the text isn't asking for a definition", () => {
  assert.equal(toDictionaryItem("safari", PHRASES), undefined);
});

test("there's no row for a phrase that isn't on the list", () => {
  assert.equal(toDictionaryItem("meaning of run", PHRASES), undefined);
});

test("the row names the term and says what Enter does", () => {
  const item = toDictionaryItem("what is serendipity?", PHRASES);
  assert.equal(item?.name, "Define serendipity");
  assert.equal(item?.footer, "↵ define");
});

test("the row cuts a long term short and removes control characters", () => {
  const name = toDictionaryItem(`define a\u001B[31m${"x".repeat(200)}`, PHRASES)?.name ?? "";
  assert.ok(name.length < 40);
  assert.ok(!name.includes("\u001B"));
});
