import assert from "node:assert/strict";
import { test } from "node:test";
import { rankItems } from "../launcher/search.ts";
import { findMedeaItem, listMedeaApps, listMedeaItems } from "./registry.ts";

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

test("Logs, Open Folder is available from the search prompt", () => {
  const item = findMedeaItem("medea-logs:view");
  assert.equal(item?.name, "Logs, Open Folder");
  assert.equal(item?.kind, "Command");
  assert.equal(rankItems("Logs, Open Folder", listMedeaItems())[0]?.value, "medea-logs:view");
});
