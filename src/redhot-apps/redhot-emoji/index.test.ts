import assert from "node:assert/strict";
import { test } from "node:test";
import { emoji } from "./index.ts";

// Imported first on purpose: a static import of the hotkey list makes a cycle through the registry.
test("adds one item to search, whatever loads this file first", () => {
  assert.deepEqual(
    emoji.listItems().map(({ value }) => value),
    ["redhot-emoji:open"],
  );
});
