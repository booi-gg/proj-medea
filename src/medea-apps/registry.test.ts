import assert from "node:assert/strict";
import { test } from "node:test";
import { listMedeaApps } from "./registry.ts";

test("every built-in app ID starts with medea-, leaving other names for third parties", () => {
  for (const { id } of listMedeaApps()) {
    assert.match(id, /^medea-[a-z-]+$/);
  }
});

test("app IDs are unique", () => {
  const ids = listMedeaApps().map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every item value is namespaced by its app", () => {
  for (const { id, listItems } of listMedeaApps()) {
    for (const { value } of listItems()) {
      assert.ok(value.startsWith(`${id}:`), value);
    }
  }
});
