import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import { createQueryExit } from "./query-exit.ts";

const startsWithF = (query: string): boolean => query.startsWith("f ");

test("leaves the search list only after the keypress is done", async () => {
  let closes = 0;
  const onQueryChange = createQueryExit(() => {
    closes += 1;
  }, startsWithF);
  onQueryChange("f ");
  assert.equal(closes, 0);
  await nextTurn();
  assert.equal(closes, 1);
});

test("pasted text closes the list once, so the screen it opens stays open", async () => {
  let closes = 0;
  const onQueryChange = createQueryExit(() => {
    closes += 1;
  }, startsWithF);
  for (const query of ["f ", "f s", "f sa", "f saf"]) {
    onQueryChange(query);
  }
  await nextTurn();
  await nextTurn();
  assert.equal(closes, 1);
});

test("ordinary searching never closes the list", async () => {
  let closes = 0;
  const onQueryChange = createQueryExit(() => {
    closes += 1;
  }, startsWithF);
  onQueryChange("firefox");
  await nextTurn();
  assert.equal(closes, 0);
});
