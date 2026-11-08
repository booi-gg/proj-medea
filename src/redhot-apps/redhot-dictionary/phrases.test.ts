import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_DEFINE_PHRASES } from "../../config.ts";
import { parsePhrases, toDefineTerm } from "./phrases.ts";

const termFor = (query: string): string | undefined => toDefineTerm(query, DEFAULT_DEFINE_PHRASES);

test("finds the term after a phrase, in any case", () => {
  assert.equal(termFor("define serendipity"), "serendipity");
  assert.equal(termFor("Define Serendipity"), "Serendipity");
  assert.equal(termFor("  define   run  "), "run");
});

test("every starting phrase opens the dictionary", () => {
  assert.equal(termFor("meaning of run"), "run");
  assert.equal(termFor("definition of run"), "run");
  assert.equal(termFor("what is run"), "run");
  assert.equal(termFor("what's run"), "run");
});

test("the longest phrase wins, whatever order they're saved in", () => {
  assert.equal(termFor("what is the meaning of run"), "run");
  assert.equal(termFor("what's the meaning of run"), "run");
  assert.equal(toDefineTerm("what is the x", ["what is", "what is the"]), "x");
  assert.equal(toDefineTerm("what is the x", ["what is the", "what is"]), "x");
});

test("a question mark isn't part of the term", () => {
  assert.equal(termFor("what is serendipity?"), "serendipity");
  assert.equal(termFor("what is serendipity ?"), "serendipity");
});

test("a term can be several words", () => {
  assert.equal(termFor("define ice cream"), "ice cream");
});

test("a real question is too long to be a term", () => {
  assert.equal(termFor("what is the tallest mountain in asia"), undefined);
});

test("needs both a phrase and a term", () => {
  assert.equal(termFor("define"), undefined);
  assert.equal(termFor("define "), undefined);
  assert.equal(termFor("define ?"), undefined);
  assert.equal(termFor("what is"), undefined);
  assert.equal(termFor("defined word"), undefined);
  assert.equal(termFor("how to define x"), undefined);
});

test("an empty list opens nothing", () => {
  assert.equal(toDefineTerm("define run", []), undefined);
});

test("reads comma-separated phrases in one form", () => {
  assert.deepEqual(parsePhrases("define,  What   Does , meaning of"), [
    "define",
    "what does",
    "meaning of",
  ]);
});

test("skips blanks and repeats between the commas", () => {
  assert.deepEqual(parsePhrases("define,, DEFINE , ,"), ["define"]);
  assert.deepEqual(parsePhrases("  "), []);
});

test("keeps an apostrophe in a phrase", () => {
  assert.deepEqual(parsePhrases("what's"), ["what's"]);
});
