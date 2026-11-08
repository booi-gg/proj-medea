import assert from "node:assert/strict";
import { test } from "node:test";
import type { LauncherItem } from "../redhot-apps/types.ts";
import { orderSearchItems } from "./launcher.ts";
import { rankItems } from "./search.ts";

const toItem = (value: string, name: string, ranksAfterApps = false): LauncherItem => ({
  value,
  name,
  icon: "",
  kind: "",
  ranksAfterApps,
  run: async () => "",
});

test("commands and Redhot items come before apps, and projects after them", () => {
  const ordered = orderSearchItems(
    [toItem("fixed", "Exit")],
    [toItem("project", "site", true), toItem("snippet", "Address")],
    [toItem("app", "Safari")],
  );
  assert.deepEqual(
    ordered.map(({ value }) => value),
    ["fixed", "snippet", "app", "project"],
  );
});

test("an app wins a tie with a project of a similar name", () => {
  const ordered = orderSearchItems(
    [],
    [toItem("project", "Calendar-sync", true)],
    [toItem("app", "Calendar-app")],
  );
  assert.equal(rankItems("calendar", ordered)[0]?.value, "app");
});

test("a project still comes first when it's the better match", () => {
  const ordered = orderSearchItems(
    [],
    [toItem("project", "calendar", true)],
    [toItem("app", "My Calendar")],
  );
  assert.equal(rankItems("calendar", ordered)[0]?.value, "project");
});
