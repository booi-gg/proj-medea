import assert from "node:assert/strict";
import { test } from "node:test";
import { fillSnippet, usesClipboard } from "./placeholders.ts";

const values = { now: new Date(2026, 10, 8, 9, 5), clipboard: "copied" };

test("fills the date and time with zero-padded local values", () => {
  assert.equal(fillSnippet("{date} at {time}", values), "2026-11-08 at 09:05");
});

test("fills the clipboard, and every copy of a placeholder", () => {
  assert.equal(fillSnippet("{clipboard} and {clipboard}", values), "copied and copied");
});

test("drops the cursor marker, since a copy has no cursor", () => {
  assert.equal(fillSnippet("Hi {cursor}there", values), "Hi there");
});

test("leaves other braces alone", () => {
  assert.equal(fillSnippet('{name} {"a":1} {}', values), '{name} {"a":1} {}');
});

test("doesn't fill placeholders that came in from the clipboard", () => {
  assert.equal(fillSnippet("{clipboard}", { ...values, clipboard: "{date}" }), "{date}");
});

test("only reads the clipboard when the snippet asks for it", () => {
  assert.equal(usesClipboard("Paste {clipboard} here"), true);
  assert.equal(usesClipboard("{date}"), false);
});
