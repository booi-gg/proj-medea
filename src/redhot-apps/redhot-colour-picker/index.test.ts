import assert from "node:assert/strict";
import { test } from "node:test";
import { colourPicker } from "./index.ts";

// Saved aliases and hotkeys use these values, so they must not change.
test("adds the picker and its history to search", () => {
  assert.deepEqual(
    colourPicker.listItems().map(({ value }) => value),
    ["redhot-colour-picker:pick", "redhot-colour-picker:history"],
  );
});

test("both ask for a window, because they show a list to choose from", () => {
  for (const { needsWindow } of colourPicker.listItems()) {
    assert.equal(needsWindow, true);
  }
});
