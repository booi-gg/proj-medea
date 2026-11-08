import assert from "node:assert/strict";
import { test } from "node:test";
import { files, toFileSearchQuery } from "./index.ts";

test("the f prefix asks for files, and what follows it is the search", () => {
  assert.equal(toFileSearchQuery("f report"), "report");
  assert.equal(toFileSearchQuery("F report"), "report");
  assert.equal(toFileSearchQuery("f "), "");
});

test("words that only start with f stay in app search", () => {
  assert.equal(toFileSearchQuery("f"), undefined);
  assert.equal(toFileSearchQuery("firefox"), undefined);
  assert.equal(toFileSearchQuery("find my"), undefined);
});

test("Search Files opens a window, because it asks for input", () => {
  const [item] = files.listItems();
  assert.equal(item?.value, "redhot-files:search");
  assert.equal(item?.needsWindow, true);
});
