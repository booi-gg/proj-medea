import assert from "node:assert/strict";
import { test } from "node:test";
import { convertUnits } from "./units.ts";

const answerFor = (text: string): string | undefined => convertUnits(text)?.answer;

test("converts the examples people type", () => {
  assert.deepEqual(convertUnits("5 km in miles"), { name: "5 km = 3.1069 mi", answer: "3.1069" });
  assert.deepEqual(convertUnits("72 f to c"), { name: "72 °F = 22.2222 °C", answer: "22.2222" });
  assert.deepEqual(convertUnits("2 GB in MB"), { name: "2 GB = 2,000 MB", answer: "2000" });
});

test("the row groups thousands and the copied number doesn't", () => {
  const conversion = convertUnits("5 km to m");
  assert.equal(conversion?.name, "5 km = 5,000 m");
  assert.equal(conversion?.answer, "5000");
});

test("temperature isn't a simple factor", () => {
  assert.equal(answerFor("100 c to f"), "212");
  assert.equal(answerFor("0 c in k"), "273.15");
  assert.equal(answerFor("-40 f to c"), "-40");
  assert.equal(answerFor("32 °F to °C"), "0");
});

test("the word in can be the unit and the separator", () => {
  assert.equal(answerFor("5 in in cm"), "12.7");
  assert.equal(answerFor("5 inches to cm"), "12.7");
});

test("no space is needed after the number", () => {
  assert.equal(answerFor("5km to mi"), "3.1069");
});

test("full names, plurals and capitals all work", () => {
  assert.equal(answerFor("3 Feet in Metres"), "0.9144");
  assert.equal(answerFor("1 kilogram to pounds"), "2.2046");
});

test("units with two words work", () => {
  assert.equal(answerFor("1 acre to sq ft"), "43560");
  assert.equal(answerFor("8 fl oz to ml"), "236.5882");
});

test("Mb means megabits, and mb means megabytes as people usually type it", () => {
  assert.equal(answerFor("8 Mb to MB"), "1");
  assert.equal(answerFor("8 mb to MB"), "8");
});

test("binary sizes are there when asked for", () => {
  assert.equal(answerFor("1 GiB to MiB"), "1024");
});

test("a very small answer keeps its digits", () => {
  assert.equal(answerFor("1 mm to km"), "0.000001");
});

test("each group converts", () => {
  assert.equal(answerFor("1 kg to g"), "1000");
  assert.equal(answerFor("1 gal to l"), "3.7854");
  assert.equal(answerFor("60 mph to km/h"), "96.5606");
  assert.equal(answerFor("2 hours to min"), "120");
  assert.equal(answerFor("1 ha to m2"), "10000");
});

test("anything else isn't a conversion", () => {
  for (const text of [
    "5 km in kg",
    "5 km in",
    "5 banana to km",
    "km to miles",
    "356 USD to INR",
    "Google Chrome",
    "",
  ]) {
    assert.equal(convertUnits(text), undefined, text);
  }
});
