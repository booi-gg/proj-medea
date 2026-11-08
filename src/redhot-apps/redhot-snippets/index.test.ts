import assert from "node:assert/strict";
import { test } from "node:test";
import { rankItems } from "../../launcher/search.ts";
import { findRedhotItem, listRedhotItems } from "../registry.ts";

test("Snippets, Show All is available from search and opens in a window", () => {
  const item = findRedhotItem("redhot-snippets:show-all");
  assert.equal(item?.name, "Snippets, Show All");
  assert.equal(item?.kind, "Command");
  assert.equal(item?.needsWindow, true);
  assert.equal(
    rankItems("Snippets, Show All", listRedhotItems())[0]?.value,
    "redhot-snippets:show-all",
  );
});
