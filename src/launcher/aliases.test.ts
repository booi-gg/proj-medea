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
  assert.equal(findAliasProblem(["my code"], "/a.app", {}), `"my code" can't contain spaces`);
});

test("allows two aliases at the maximum length", () => {
  assert.equal(findAliasProblem(["12345678", "abcdefgh"], "/a.app", {}), undefined);
});

test("rejects more than two aliases", () => {
  assert.equal(findAliasProblem(["a", "b", "c"], "/a.app", {}), "Use at most 2 aliases");
});

test("rejects an alias over the maximum length", () => {
  assert.equal(
    findAliasProblem(["ngangthoi"], "/a.app", {}),
    `"ngangthoi" is too long, use 8 characters or fewer`,
  );
});

test("rejects an alias another item uses, naming that item", () => {
  const aliases = { "/Applications/Visual Studio Code.app": ["code"] };
  assert.equal(
    findAliasProblem(["code"], "/Applications/Cursor.app", aliases),
    `"code" is already used by Visual Studio Code`,
  );
});

test("names a command without its prefix", () => {
  assert.equal(
    findAliasProblem(["q"], "/a.app", { "command:exit": ["q"] }),
    `"q" is already used by exit`,
  );
});

test("an item can keep its own aliases", () => {
  assert.equal(findAliasProblem(["code"], "/a.app", { "/a.app": ["code"] }), undefined);
});

test("names an app, a command and a quicklink", () => {
  assert.equal(toDisplayName("/Applications/Visual Studio Code.app"), "Visual Studio Code");
  assert.equal(toDisplayName("command:exit"), "exit");
  assert.equal(toDisplayName("quicklink:github-search"), "github-search");
});
