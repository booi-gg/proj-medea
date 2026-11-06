import assert from "node:assert/strict";
import { test } from "node:test";
import { findNameProblem, parseQuicklinks, toQuicklinkId } from "./store.ts";

const github = { id: "github", name: "GitHub", link: "https://github.com" };

test("makes a readable ID from the name", () => {
  assert.equal(toQuicklinkId("GitHub Search!", []), "github-search");
});

test("keeps IDs unique", () => {
  assert.equal(toQuicklinkId("GitHub", ["github", "github-2"]), "github-3");
});

test("never takes a reserved ID", () => {
  assert.equal(toQuicklinkId("Create", ["create"]), "create-2");
});

test("a name with no latin letters still gets an ID", () => {
  assert.equal(toQuicklinkId("日本語", []), "link");
});

test("reads saved links and skips broken entries", () => {
  const saved = JSON.stringify([github, { id: "no-link", name: "Broken" }]);
  assert.deepEqual(parseQuicklinks(saved), [github]);
});

test("a broken file throws, so a save can't overwrite it", () => {
  assert.throws(() => parseQuicklinks("{ not json"));
  assert.throws(() => parseQuicklinks("{}"));
});

test("rejects an empty name", () => {
  assert.equal(findNameProblem("  ", undefined, []), "Enter a name");
});

test("rejects a name another link uses, in any case", () => {
  assert.equal(
    findNameProblem("github", undefined, [github]),
    "You already have a quicklink with that name",
  );
});

test("a link may keep its own name", () => {
  assert.equal(findNameProblem("GitHub", "github", [github]), undefined);
});
