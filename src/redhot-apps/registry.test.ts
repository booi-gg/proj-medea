import assert from "node:assert/strict";
import { test } from "node:test";
import { rankItems } from "../launcher/search.ts";
import {
  findRedhotItem,
  findRedhotItemName,
  listRedhotApps,
  listRedhotItems,
  withoutRemovedItems,
} from "./registry.ts";

test("every built-in app ID starts with redhot-, leaving other names for third parties", () => {
  for (const { id } of listRedhotApps()) {
    assert.match(id, /^redhot-[a-z-]+$/);
  }
});

test("app IDs are unique", () => {
  const ids = listRedhotApps().map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every item value is namespaced by its app", () => {
  for (const { id, listItems } of listRedhotApps()) {
    for (const { value } of listItems()) {
      assert.ok(value.startsWith(`${id}:`), value);
    }
  }
});

test("Logs, Open Folder is available from the search prompt", () => {
  const item = findRedhotItem("redhot-logs:view");
  assert.equal(item?.name, "Logs, Open Folder");
  assert.equal(item?.kind, "Command");
  assert.equal(rankItems("Logs, Open Folder", listRedhotItems())[0]?.value, "redhot-logs:view");
});

test("a Pomodoro and cancelling a timer can be found by typing them", () => {
  assert.equal(rankItems("pomodoro", listRedhotItems())[0]?.value, "redhot-timer:pomodoro");
  assert.equal(rankItems("timer cancel", listRedhotItems())[0]?.value, "redhot-timer:cancel");
});

test("leaves out hotkeys for items that no longer exist", () => {
  const live = {
    "/Applications/Safari.app": "shift+cmd+s",
    "command:exit": "shift+cmd+e",
    "redhot-clipboard-history:open": "shift+cmd+c",
  };
  assert.deepEqual(
    withoutRemovedItems({ ...live, "medea-clipboard-history:open": "shift+cmd+c" }),
    live,
  );
});

test("finds the name search shows for an item", () => {
  assert.equal(findRedhotItemName("redhot-logs:view"), "Logs, Open Folder");
  assert.equal(findRedhotItemName("redhot-logs:gone"), undefined);
});
