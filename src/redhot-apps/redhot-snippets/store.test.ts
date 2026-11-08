import assert from "node:assert/strict";
import { test } from "node:test";
import { findKeywordProblem, findNameProblem, parseSnippets } from "./store.ts";

const address = { id: "address", name: "Address", keyword: ";addr", text: "1 Main St" };
const noKeyword = { id: "note", name: "Note", text: "Hello" };

test("reads saved snippets and skips broken entries", () => {
  const saved = JSON.stringify([address, noKeyword, { id: "no-text", name: "Broken" }]);
  assert.deepEqual(parseSnippets(saved), [address, noKeyword]);
});

test("a broken file throws, so a save can't overwrite it", () => {
  assert.throws(() => parseSnippets("{ not json"));
  assert.throws(() => parseSnippets("{}"));
});

test("rejects an empty name and one already in use", () => {
  assert.equal(findNameProblem("  ", undefined, []), "Enter a name");
  assert.equal(
    findNameProblem("address", undefined, [address]),
    "You already have a snippet with that name",
  );
});

test("a snippet may keep its own name and keyword", () => {
  assert.equal(findNameProblem("Address", "address", [address]), undefined);
  assert.equal(findKeywordProblem(";addr", "address", [address]), undefined);
});

test("a keyword is optional", () => {
  assert.equal(findKeywordProblem("  ", undefined, [address]), undefined);
});

test("rejects keywords that are too short, too long or contain spaces", () => {
  assert.equal(findKeywordProblem(";", undefined, []), "Use 2 to 32 characters");
  assert.equal(findKeywordProblem(";".repeat(33), undefined, []), "Use 2 to 32 characters");
  assert.equal(findKeywordProblem("; addr", undefined, []), "A keyword can't contain spaces");
});

test("rejects a keyword another snippet uses", () => {
  assert.equal(
    findKeywordProblem(";addr", undefined, [address]),
    "Another snippet uses that keyword",
  );
});

test("rejects a keyword that overlaps another, in either direction", () => {
  assert.match(findKeywordProblem(";ad", undefined, [address]) ?? "", /overlaps with ;addr/);
  assert.match(findKeywordProblem(";addr2", undefined, [address]) ?? "", /overlaps with ;addr/);
});
