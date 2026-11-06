import assert from "node:assert/strict";
import { test } from "node:test";
import { styleText } from "node:util";
import stringWidth from "string-width";
import { fitToWidth, joinColumns, padToWidth, toSplitLayout } from "./split-view.ts";

test("leaves text that fits", () => {
  assert.equal(fitToWidth("abcde", 5), "abcde");
});

test("cuts long text with an ellipsis", () => {
  assert.equal(fitToWidth("abcdefghij", 5), "abcd…");
});

test("counts wide characters as two columns", () => {
  const fitted = fitToWidth("日本語日本語", 7);
  assert.equal(fitted, "日本語…");
  assert.equal(stringWidth(fitted), 7);
});

test("padding ignores colour codes", () => {
  assert.equal(stringWidth(padToWidth(styleText("red", "ab"), 5)), 5);
});

test("a normal window fits both panes on one line", () => {
  const layout = toSplitLayout(80, 24);
  assert.deepEqual(layout, { listWidth: 30, previewWidth: 42, height: 12 });
});

test("a narrow window has no preview", () => {
  assert.equal(toSplitLayout(50, 24), undefined);
});

test("height stays usable in short and tall windows", () => {
  assert.equal(toSplitLayout(80, 10)?.height, 4);
  assert.equal(toSplitLayout(80, 100)?.height, 16);
});

test("joins columns into rows of the layout's height", () => {
  const layout = { listWidth: 4, previewWidth: 10, height: 3 };
  assert.deepEqual(joinColumns(["a"], ["x", "y"], layout, "|"), [
    "a        | x",
    "         | y",
    "         | ",
  ]);
});
