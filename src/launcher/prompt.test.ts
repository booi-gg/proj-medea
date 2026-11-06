import assert from "node:assert/strict";
import { test } from "node:test";
import { styleText } from "node:util";
import { drawTextCursor, readTextBeforeSettingsKey } from "./prompt.ts";

test("the cursor sits after the text when it's at the end", () => {
  assert.equal(drawTextCursor("2 * 4", 5), "2 * 4█");
});

test("the cursor marks the character at its position", () => {
  assert.equal(drawTextCursor("2 * 4", 0), `${styleText("inverse", "2")} * 4`);
  assert.equal(drawTextCursor("2 * 4", 2), `2 ${styleText("inverse", "*")} 4`);
});

test("the cursor marks a whole emoji", () => {
  assert.equal(drawTextCursor("a😀b", 1), `a${styleText("inverse", "😀")}b`);
});

test("typing with no settings key is left alone", () => {
  assert.equal(readTextBeforeSettingsKey("youtube"), undefined);
  assert.equal(readTextBeforeSettingsKey("\r"), undefined);
});

test("finds a settings key on its own", () => {
  assert.equal(readTextBeforeSettingsKey("\t"), "");
  assert.equal(readTextBeforeSettingsKey("\u001B[27;2;13~"), "");
  assert.equal(readTextBeforeSettingsKey("\u001B[13;2u"), "");
});

test("keeps the letters that arrived with the key", () => {
  assert.equal(readTextBeforeSettingsKey("tube\t"), "tube");
  assert.equal(readTextBeforeSettingsKey("tube\u001B[27;2;13~"), "tube");
});

test("stops at the first settings key", () => {
  assert.equal(readTextBeforeSettingsKey("a\tb\t"), "a");
});
