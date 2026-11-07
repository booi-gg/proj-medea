import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate } from "./calculate.ts";

test("works out each operator", () => {
  assert.equal(calculate("2 * 4"), "8");
  assert.equal(calculate("2 + 4"), "6");
  assert.equal(calculate("2 - 4"), "-2");
  assert.equal(calculate("8 / 4"), "2");
  assert.equal(calculate("7 % 4"), "3");
  assert.equal(calculate("2 ^ 4"), "16");
});

test("spaces around the sum don't matter", () => {
  assert.equal(calculate("2*4"), "8");
  assert.equal(calculate("  2  *  4  "), "8");
});

test("multiplies before adding", () => {
  assert.equal(calculate("2 + 3 * 4"), "14");
});

test("works left to right at the same level", () => {
  assert.equal(calculate("10 - 3 - 2"), "5");
  assert.equal(calculate("16 / 4 / 2"), "2");
});

test("brackets go first", () => {
  assert.equal(calculate("(2 + 3) * 4"), "20");
  assert.equal(calculate("((2))+1"), "3");
});

test("powers work right to left, and before a leading minus", () => {
  assert.equal(calculate("2 ^ 3 ^ 2"), "512");
  assert.equal(calculate("-2 ^ 2"), "-4");
  assert.equal(calculate("(-2) ^ 2"), "4");
  assert.equal(calculate("2 ^ -1"), "0.5");
});

test("handles negative numbers", () => {
  assert.equal(calculate("-2 * 4"), "-8");
  assert.equal(calculate("2 * -4"), "-8");
  assert.equal(calculate("2 - -4"), "6");
});

test("handles decimals", () => {
  assert.equal(calculate("1.5 * 2"), "3");
  assert.equal(calculate(".5 + 1."), "1.5");
});

test("hides the rounding error of binary fractions", () => {
  assert.equal(calculate("0.1 + 0.2"), "0.3");
  assert.equal(calculate("1 / 3"), "0.333333333333333");
});

test("keeps every digit of a large whole number", () => {
  assert.equal(calculate("2 ^ 53"), "9007199254740992");
});

test("a result of zero is never negative", () => {
  assert.equal(calculate("0 * -1"), "0");
});

test("a number with no sum isn't a calculation", () => {
  assert.equal(calculate("2"), undefined);
  assert.equal(calculate("-2"), undefined);
  assert.equal(calculate("(2)"), undefined);
});

test("search text isn't a calculation", () => {
  assert.equal(calculate(""), undefined);
  assert.equal(calculate("calc"), undefined);
  assert.equal(calculate("1password"), undefined);
  assert.equal(calculate("2 * x"), undefined);
});

test("a sum still being typed isn't a calculation", () => {
  assert.equal(calculate("2 *"), undefined);
  assert.equal(calculate("(2 + 3"), undefined);
  assert.equal(calculate("2 + 3)"), undefined);
});

test("numbers side by side aren't a calculation", () => {
  assert.equal(calculate("2 4"), undefined);
  assert.equal(calculate("1.2.3"), undefined);
});

test("a bracket touching a value multiplies it", () => {
  assert.equal(calculate("4(4)"), "16");
  assert.equal(calculate("(2)(3)"), "6");
  assert.equal(calculate("(2)3"), "6");
  assert.equal(calculate("2 (3)"), "6");
  assert.equal(calculate("(2+4) + 4(4)"), "22");
});

test("a touching bracket ranks with * and /", () => {
  assert.equal(calculate("1 + 2(3)"), "7");
  assert.equal(calculate("8 / 2(2)"), "8");
  assert.equal(calculate("2(3) ^ 2"), "18");
  assert.equal(calculate("-2(3)"), "-6");
});

test("a touching bracket still needs something inside it", () => {
  assert.equal(calculate("2()"), undefined);
  assert.equal(calculate("2(3"), undefined);
});

test("an answer that isn't a number shows nothing", () => {
  assert.equal(calculate("1 / 0"), undefined);
  assert.equal(calculate("0 / 0"), undefined);
  assert.equal(calculate("(-8) ^ 0.5"), undefined);
  assert.equal(calculate("9 ^ 9 ^ 9"), undefined);
});

test("never runs the text as code", () => {
  assert.equal(calculate("process.exit(1)"), undefined);
  assert.equal(calculate("1 + (() => 1)()"), undefined);
});
