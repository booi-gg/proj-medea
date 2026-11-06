import assert from "node:assert/strict";
import { test } from "node:test";
import { readTextBeforeSettingsKey } from "./prompt.ts";

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
