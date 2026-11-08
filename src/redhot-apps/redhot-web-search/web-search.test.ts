import assert from "node:assert/strict";
import { test } from "node:test";
import { WEB_SEARCH_ENGINE_CHOICES } from "../../config.ts";
import { findAliasProblem } from "../../launcher/aliases.ts";
import { toTerminalWidth } from "../../launcher/screen.ts";
import { findArguments } from "../redhot-quicklinks/placeholders.ts";
import type { Quicklink } from "../redhot-quicklinks/store.ts";
import { findAliasSearch } from "./alias-search.ts";
import {
  READY_MADE_ENGINES,
  WEB_SEARCH_ENGINES,
  isAliasTaken,
  listAddableEngines,
  toAddedMessage,
} from "./engines.ts";
import {
  WEB_SEARCH_FALLBACK_VALUE,
  toAliasSearchItem,
  toWebSearchItem,
  toWebSearchLink,
} from "./index.ts";

const MAX_ROW_NAME_COLUMNS = 60;

const youtube: Quicklink = {
  id: "youtube",
  name: "YouTube Search",
  link: "https://www.youtube.com/results?search_query={query}",
};
const noArguments: Quicklink = { id: "meet", name: "Meet", link: "https://meet.google.com" };
const twoArguments: Quicklink = { id: "two", name: "Two", link: "https://a.dev/{first}/{second}" };
const sharedArgument: Quicklink = { id: "same", name: "Same", link: "https://a.dev/{q}/{q}" };
const links = [youtube, noArguments, twoArguments, sharedArgument];
const aliases = {
  "redhot-quicklinks:youtube": ["yt"],
  "redhot-quicklinks:meet": ["meet"],
  "redhot-quicklinks:two": ["two"],
  "redhot-quicklinks:same": ["same"],
  "/Applications/Code.app": ["code"],
};

test("an alias and some text fill that quicklink's argument", () => {
  assert.deepEqual(findAliasSearch("yt lofi hip hop", links, aliases), {
    quicklink: youtube,
    argumentKey: "query",
    text: "lofi hip hop",
  });
});

test("the alias matches in any case and ignores extra spaces", () => {
  assert.equal(findAliasSearch("  YT   lofi  ", links, aliases)?.text, "lofi");
});

test("an alias with no text is left to ordinary search", () => {
  assert.equal(findAliasSearch("yt", links, aliases), undefined);
  assert.equal(findAliasSearch("yt   ", links, aliases), undefined);
});

test("an unknown alias, or one that isn't a quicklink's, finds nothing", () => {
  assert.equal(findAliasSearch("nope lofi", links, aliases), undefined);
  assert.equal(findAliasSearch("code review", links, aliases), undefined);
});

test("only a link with exactly one question is offered", () => {
  assert.equal(findAliasSearch("meet lofi", links, aliases), undefined);
  assert.equal(findAliasSearch("two lofi", links, aliases), undefined);
  assert.equal(findAliasSearch("same lofi", links, aliases)?.argumentKey, "q");
});

test("the alias row names the link and the text", () => {
  const item = toAliasSearchItem("yt lofi", links, aliases);
  assert.equal(item?.name, "YouTube Search: lofi");
  assert.equal(item?.kind, "Quicklink");
  assert.equal(toAliasSearchItem("zzz lofi", links, aliases), undefined);
});

test("the fallback row names the engine and what was typed", () => {
  const item = toWebSearchItem("  xyz  ", "google");
  assert.equal(item?.value, WEB_SEARCH_FALLBACK_VALUE);
  assert.equal(item?.name, "Search Google for 'xyz'");
  assert.equal(toWebSearchItem("xyz", "kagi")?.name, "Search Kagi for 'xyz'");
});

test("there's no fallback row for blank text", () => {
  assert.equal(toWebSearchItem("   ", "google"), undefined);
});

test("a long search stays on one row", () => {
  const name = toWebSearchItem("very long search ".repeat(20), "duckduckgo")?.name ?? "";
  assert.ok(toTerminalWidth(name) <= MAX_ROW_NAME_COLUMNS);
  assert.ok(name.endsWith("…"));
});

test("control characters from a paste can't reach the terminal", () => {
  assert.equal(toWebSearchItem("a\u001B[31mb", "google")?.name, "Search Google for 'a[31mb'");
});

test("the search text is encoded, so it can't change the link", () => {
  assert.equal(
    toWebSearchLink("google", "c++ & rust?"),
    "https://www.google.com/search?q=c%2B%2B%20%26%20rust%3F",
  );
});

test("every fallback engine fills its search text", () => {
  for (const engine of WEB_SEARCH_ENGINE_CHOICES) {
    assert.ok(toWebSearchLink(engine, "xyz").endsWith("=xyz"), engine);
    assert.deepEqual(
      findArguments(WEB_SEARCH_ENGINES[engine].link).map(({ key }) => key),
      ["query"],
    );
  }
});

test("every ready-made engine asks one question and has a valid, unique alias", () => {
  for (const { name, link, alias } of READY_MADE_ENGINES) {
    assert.equal(findArguments(link).length, 1, name);
    assert.equal(findAliasProblem([alias]), undefined, name);
  }
  const allAliases = READY_MADE_ENGINES.map(({ alias }) => alias);
  assert.equal(new Set(allAliases).size, allAliases.length);
});

test("an engine already saved isn't offered, by name in any case or by link", () => {
  const byName = { id: "a", name: "github search", link: "https://example.com" };
  const byLink = { id: "b", name: "Tube", link: youtube.link };
  const names = listAddableEngines([byName, byLink]).map(({ name }) => name);
  assert.ok(!names.includes("GitHub Search"));
  assert.ok(!names.includes("YouTube Search"));
  assert.ok(names.includes("npm Search"));
});

test("a taken alias is noticed", () => {
  assert.equal(isAliasTaken("yt", aliases), true);
  assert.equal(isAliasTaken("gh", aliases), false);
});

test("the added message suggests an alias, or says which link needs one", () => {
  const [github, tube] = READY_MADE_ENGINES as [
    (typeof READY_MADE_ENGINES)[0],
    (typeof READY_MADE_ENGINES)[0],
  ];
  assert.equal(
    toAddedMessage([github], []),
    "Added 1 search engine. Type an alias and a search, like gh redhot",
  );
  assert.equal(
    toAddedMessage([github, tube], [tube]),
    "Added 2 search engines. Usual alias taken, so set one with Tab for: YouTube Search",
  );
});
