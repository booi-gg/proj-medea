import assert from "node:assert/strict";
import { test } from "node:test";
import { findAliasProblem, parseAliasInput, toDisplayName } from "./aliases.ts";

test("splits, trims and lowercases aliases", () => {
  assert.deepEqual(parseAliasInput(" Code, IDE ,"), ["code", "ide"]);
});

test("removes duplicates", () => {
  assert.deepEqual(parseAliasInput("code, CODE"), ["code"]);
});

test("empty input means no aliases", () => {
  assert.deepEqual(parseAliasInput("  , "), []);
});

test("rejects spaces", () => {
  assert.equal(findAliasProblem(["my code"]), `"my code" can't contain spaces`);
});

test("allows two aliases at the maximum length", () => {
  assert.equal(findAliasProblem(["12345678", "abcdefgh"]), undefined);
});

test("rejects more than two aliases", () => {
  assert.equal(findAliasProblem(["a", "b", "c"]), "Use at most 2 aliases");
});

test("rejects an alias over the maximum length", () => {
  assert.equal(
    findAliasProblem(["ngangthoi"]),
    `"ngangthoi" is too long, use 8 characters or fewer`,
  );
});

test("names an app, a command and a quicklink", () => {
  assert.equal(toDisplayName("/Applications/Visual Studio Code.app"), "Visual Studio Code");
  assert.equal(toDisplayName("command:exit"), "exit");
  assert.equal(toDisplayName("redhot-quicklinks:github-search"), "github-search");
});
