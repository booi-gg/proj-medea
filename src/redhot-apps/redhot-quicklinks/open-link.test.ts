import assert from "node:assert/strict";
import { test } from "node:test";
import {
  expandHome,
  findLinkProblem,
  normalizeLink,
  openTarget,
  toOpenArguments,
} from "./open-link.ts";

test("adds https to a bare domain", () => {
  assert.equal(normalizeLink(" github.com/search "), "https://github.com/search");
  assert.equal(normalizeLink("example.com:8080"), "https://example.com:8080");
});

test("adds http to a local address", () => {
  assert.equal(normalizeLink("localhost:3000/docs"), "http://localhost:3000/docs");
});

test("leaves full links and paths alone", () => {
  for (const link of [
    "https://x.dev",
    "spotify:search:x",
    "mailto:a@b.dev",
    "~/Documents",
    "/tmp",
  ]) {
    assert.equal(normalizeLink(link), link);
  }
});

test("accepts URLs, deeplinks, paths and a lone placeholder", () => {
  for (const link of ["github.com", "spotify://x", "~/Documents", "/tmp", "{clipboard}"]) {
    assert.equal(findLinkProblem(link), undefined);
  }
});

test("rejects an empty link", () => {
  assert.equal(findLinkProblem("  "), "Enter a link");
});

test("rejects text that isn't a link", () => {
  assert.equal(
    findLinkProblem("github"),
    "Use a URL like https://github.com, or a path like ~/Documents",
  );
});

test("rejects more than three arguments", () => {
  assert.equal(
    findLinkProblem("https://x.dev/{argument}/{argument}/{argument}/{argument}"),
    "Use at most 3 arguments",
  );
});

test("expands the home folder", () => {
  assert.equal(expandHome("~", "/Users/me"), "/Users/me");
  assert.equal(expandHome("~/Documents", "/Users/me"), "/Users/me/Documents");
  assert.equal(expandHome("/tmp/~/x", "/Users/me"), "/tmp/~/x");
});

test("builds the open command", () => {
  assert.deepEqual(toOpenArguments("https://x.dev", undefined), ["https://x.dev"]);
  assert.deepEqual(toOpenArguments("https://x.dev", "/Applications/Safari.app"), [
    "-a",
    "/Applications/Safari.app",
    "https://x.dev",
  ]);
});

test("never passes a filled link to open as a flag", async () => {
  await assert.rejects(openTarget("-a Calculator"), /Could not open/);
  await assert.rejects(openTarget("  "), /Could not open/);
});
