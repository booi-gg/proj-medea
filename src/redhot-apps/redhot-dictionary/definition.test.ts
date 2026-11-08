import assert from "node:assert/strict";
import { test } from "node:test";
import { toDefinitionLines, toDefinitionText } from "./definition.ts";

test("leaves a definition with no marked parts on one line", () => {
  assert.deepEqual(toDefinitionLines("cat | kat | a small animal"), ["cat | kat | a small animal"]);
});

test("starts each numbered sense on its own line", () => {
  assert.deepEqual(toDefinitionLines("run | verb 1 move fast. 2 flow"), [
    "run |",
    "",
    "verb 1 move fast.",
    "2 flow",
  ]);
});

test("a number out of sequence isn't a sense", () => {
  assert.deepEqual(toDefinitionLines("[mass noun] 1 weighs 3 tons. 2 flow"), [
    "[mass noun]",
    "1 weighs 3 tons.",
    "2 flow",
  ]);
});

test("a new part of speech starts the count again", () => {
  assert.deepEqual(toDefinitionLines("x [a] 1 one. 2 two. noun 1 three. 2 four"), [
    "x [a]",
    "1 one.",
    "2 two.",
    "",
    "noun 1 three.",
    "2 four",
  ]);
});

test("indents sub-senses", () => {
  assert.deepEqual(toDefinitionLines("x [a] 1 one. • two"), ["x [a]", "1 one.", "   • two"]);
});

test("sets sections apart, without reading a year as a sense", () => {
  assert.deepEqual(toDefinitionLines("x: thing. ORIGIN 1754: coined"), [
    "x: thing.",
    "",
    "ORIGIN 1754: coined",
  ]);
});

test("starts each phrase section on its own, including the two-word one", () => {
  assert.deepEqual(toDefinitionLines("x. PHRASES a. PHRASAL VERBS b. DERIVATIVES c"), [
    "x.",
    "",
    "PHRASES a.",
    "",
    "PHRASAL VERBS b.",
    "",
    "DERIVATIVES c",
  ]);
});

test("numbers inside a section aren't senses", () => {
  assert.deepEqual(toDefinitionLines("x [a] 1 one. 2 two. PHRASAL VERBS y 1 b. 2 c. 3 d"), [
    "x [a]",
    "1 one.",
    "2 two.",
    "",
    "PHRASAL VERBS y 1 b. 2 c. 3 d",
  ]);
});

test("the number on a word with several entries isn't a sense", () => {
  assert.deepEqual(toDefinitionLines("light 1 | lʌɪt | noun 1 glow. 2 lamp"), [
    "light 1 | lʌɪt |",
    "",
    "noun 1 glow.",
    "2 lamp",
  ]);
});

test("wraps to the window, with wrapped lines under the text", () => {
  const text = toDefinitionText("x [a] 1 aaaa bbbb cccc dddd eeee ffff gggg hhhh", 22);
  assert.deepEqual(text.split("\n"), ["x [a]", "1 aaaa bbbb cccc dddd", "  eeee ffff gggg hhhh"]);
});

test("wrapped sub-senses line up under their text", () => {
  const text = toDefinitionText("x • aaaa bbbb cccc dddd eeee ffff gggg hhhh", 25);
  assert.deepEqual(text.split("\n"), ["x", "   • aaaa bbbb cccc dddd", "     eeee ffff gggg hhhh"]);
});

test("breaks text with no spaces, like Japanese, to fit", () => {
  const lines = toDefinitionText("猫".repeat(30), 20).split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "猫".repeat(10));
});

test("still wraps in a very narrow window", () => {
  const lines = toDefinitionText("x • aaaa bbbb cccc dddd", 6).split("\n");
  assert.ok(lines.length > 1);
});
