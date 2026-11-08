import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fromHex,
  isHexColour,
  parseSample,
  toFormats,
  toHex,
  toHslText,
  toRgbText,
  toSwatch,
} from "./colour.ts";

const ORANGE = { red: 255, green: 87, blue: 51 };

test("reads the sampler's three numbers", () => {
  assert.deepEqual(parseSample("255 87 51\n"), ORANGE);
});

test("no output or nonsense counts as no colour", () => {
  for (const output of [
    "",
    "\n",
    "255 87",
    "255 87 51 9",
    "256 0 0",
    "-1 0 0",
    "1.5 0 0",
    "a b c",
  ]) {
    assert.equal(parseSample(output), undefined, output);
  }
});

test("writes hex with two digits per channel", () => {
  assert.equal(toHex(ORANGE), "#FF5733");
  assert.equal(toHex({ red: 0, green: 10, blue: 255 }), "#000AFF");
});

test("hex reads back as the same colour", () => {
  assert.deepEqual(fromHex(toHex(ORANGE)), ORANGE);
});

test("only full uppercase hex counts", () => {
  assert.ok(isHexColour("#FF5733"));
  for (const text of ["FF5733", "#ff5733", "#FFF", "#GGGGGG", ""]) {
    assert.ok(!isHexColour(text), text);
  }
});

test("writes RGB", () => {
  assert.equal(toRgbText(ORANGE), "rgb(255, 87, 51)");
});

test("works out HSL for colours with known answers", () => {
  const cases = [
    [ORANGE, "hsl(11, 100%, 60%)"],
    [{ red: 255, green: 255, blue: 255 }, "hsl(0, 0%, 100%)"],
    [{ red: 0, green: 0, blue: 0 }, "hsl(0, 0%, 0%)"],
    [{ red: 128, green: 128, blue: 128 }, "hsl(0, 0%, 50%)"],
    [{ red: 255, green: 0, blue: 0 }, "hsl(0, 100%, 50%)"],
    [{ red: 0, green: 255, blue: 0 }, "hsl(120, 100%, 50%)"],
    [{ red: 0, green: 0, blue: 255 }, "hsl(240, 100%, 50%)"],
  ] as const;
  for (const [colour, expected] of cases) {
    assert.equal(toHslText(colour), expected);
  }
});

test("a hue that rounds up to a full circle is written as 0", () => {
  assert.equal(toHslText({ red: 255, green: 0, blue: 1 }), "hsl(0, 100%, 50%)");
});

test("offers hex first, so a single Enter copies it", () => {
  assert.deepEqual(
    toFormats(ORANGE).map(({ label }) => label),
    ["Hex", "RGB", "HSL"],
  );
  assert.equal(toFormats(ORANGE)[0]?.text, "#FF5733");
});

test("a swatch uses full colour when the terminal has it", () => {
  assert.equal(toSwatch(ORANGE, 2, true), "\u001B[48;2;255;87;51m  \u001B[49m");
});

test("a swatch falls back to the nearest of 256 colours", () => {
  assert.equal(
    toSwatch({ red: 255, green: 255, blue: 255 }, 1, false),
    "\u001B[48;5;231m \u001B[49m",
  );
  assert.equal(toSwatch({ red: 0, green: 0, blue: 0 }, 1, false), "\u001B[48;5;16m \u001B[49m");
});
