import assert from "node:assert/strict";
import { test } from "node:test";
import { fillLink, findArguments, usesClipboard } from "./placeholders.ts";

const noValues = { answers: new Map<string, string>(), clipboard: "" };

test("a plain link has no arguments", () => {
  assert.deepEqual(findArguments("https://github.com"), []);
});

test("finds a named argument with a default", () => {
  assert.deepEqual(findArguments('https://x.dev/{argument name="tag" default="new"}'), [
    { key: "tag", label: "tag", defaultValue: "new" },
  ]);
});

test("each unnamed argument is its own question", () => {
  assert.deepEqual(
    findArguments("https://x.dev/{argument}/{argument}").map(({ label }) => label),
    ["Argument 1", "Argument 2"],
  );
});

test("arguments with the same name are asked once", () => {
  const link = 'https://x.dev/{argument name="q" default="a"}/{argument name="q"}';
  assert.deepEqual(findArguments(link), [{ key: "q", label: "q", defaultValue: "a" }]);
});

test("{query} is a named argument", () => {
  const link = "https://www.youtube.com/results?search_query={query}";
  assert.deepEqual(findArguments(link), [{ key: "query", label: "query" }]);
  assert.equal(
    fillLink(link, { answers: new Map([["query", "lo fi"]]), clipboard: "" }),
    "https://www.youtube.com/results?search_query=lo%20fi",
  );
});

test("{query} shares its value with an argument named query", () => {
  const link = 'https://x.dev/{query}/{argument name="query"}';
  assert.equal(findArguments(link).length, 1);
  assert.equal(
    fillLink(link, { answers: new Map([["query", "a"]]), clipboard: "" }),
    "https://x.dev/a/a",
  );
});

test("the clipboard is not an argument", () => {
  assert.deepEqual(findArguments("https://x.dev/{clipboard}"), []);
  assert.equal(usesClipboard("https://x.dev/{clipboard}"), true);
  assert.equal(usesClipboard("https://x.dev"), false);
});

test("encodes values in URLs", () => {
  const answers = new Map([["q", "a b&c"]]);
  assert.equal(
    fillLink('https://x.dev?q={argument name="q"}', { answers, clipboard: "" }),
    "https://x.dev?q=a%20b%26c",
  );
});

test("leaves values alone in paths", () => {
  const answers = new Map([["#1", "my notes"]]);
  assert.equal(fillLink("~/{argument}", { answers, clipboard: "" }), "~/my notes");
});

test("a link that is only a placeholder keeps its value whole", () => {
  assert.equal(
    fillLink("{clipboard}", { ...noValues, clipboard: "https://x.dev/a b" }),
    "https://x.dev/a b",
  );
});

test("fills unnamed arguments in order and a shared name everywhere", () => {
  const answers = new Map([
    ["#1", "one"],
    ["#2", "two"],
    ["q", "same"],
  ]);
  const link = 'https://x.dev/{argument}/{argument name="q"}/{argument}/{argument name="q"}';
  assert.equal(fillLink(link, { answers, clipboard: "" }), "https://x.dev/one/same/two/same");
});

test("an empty clipboard drops the placeholder", () => {
  assert.equal(fillLink("https://x.dev/{clipboard}", noValues), "https://x.dev/");
});

test("empty braces ask a question", () => {
  const link = "https://x.dev?q={}";
  assert.deepEqual(findArguments(link), [{ key: "#1", label: "Argument 1" }]);
  assert.equal(
    fillLink(link, { answers: new Map([["#1", "a b"]]), clipboard: "" }),
    "https://x.dev?q=a%20b",
  );
});

test("any word in braces is a named argument", () => {
  const link = "https://x.dev/{repo}/{tag}";
  assert.deepEqual(
    findArguments(link).map(({ label }) => label),
    ["repo", "tag"],
  );
  const answers = new Map([
    ["repo", "redhot"],
    ["tag", "v1"],
  ]);
  assert.equal(fillLink(link, { answers, clipboard: "" }), "https://x.dev/redhot/v1");
});

test("leaves braces that aren't placeholders in the link", () => {
  const link = 'https://x.dev?filter={"a":1}';
  assert.deepEqual(findArguments(link), []);
  assert.equal(fillLink(link, noValues), link);
});
