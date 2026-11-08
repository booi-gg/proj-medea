import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import { createFileSearchExit, files, toFileSearchQuery } from "./index.ts";

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

test("leaves the search list only after the keypress is done", async () => {
  let closes = 0;
  const onQueryChange = createFileSearchExit(() => {
    closes += 1;
  });
  onQueryChange("f ");
  assert.equal(closes, 0);
  await nextTurn();
  assert.equal(closes, 1);
});

test("pasted text closes the list once, so the file search list it opens stays open", async () => {
  let closes = 0;
  const onQueryChange = createFileSearchExit(() => {
    closes += 1;
  });
  for (const query of ["f ", "f s", "f sa", "f saf"]) {
    onQueryChange(query);
  }
  await nextTurn();
  await nextTurn();
  assert.equal(closes, 1);
});

test("ordinary searching never closes the list", async () => {
  let closes = 0;
  const onQueryChange = createFileSearchExit(() => {
    closes += 1;
  });
  onQueryChange("firefox");
  await nextTurn();
  assert.equal(closes, 0);
});

test("Search Files opens a window, because it asks for input", () => {
  const [item] = files.listItems();
  assert.equal(item?.value, "redhot-files:search");
  assert.equal(item?.needsWindow, true);
});
