import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppDataItem } from "./match.ts";
import { toPathLabel, uninstallApp } from "./uninstall.ts";
import type { UninstallTools } from "./uninstall.ts";

const APP = { name: "Widget", path: "/Applications/Widget.app" };
const CACHE = "/Users/me/Library/Caches/com.example.Widget";
const PREFERENCES = "/Users/me/Library/Preferences/com.example.Widget.plist";
const DATA: readonly AppDataItem[] = [
  { path: CACHE, matchedBy: "bundle-id" },
  { path: PREFERENCES, matchedBy: "bundle-id" },
];

interface Harness {
  tools: UninstallTools;
  moved: string[];
  shownData: (readonly AppDataItem[])[];
}

const createHarness = (overrides: Partial<UninstallTools> = {}, data = DATA): Harness => {
  const moved: string[] = [];
  const shownData: (readonly AppDataItem[])[] = [];
  const tools: UninstallTools = {
    isRunning: async () => false,
    findData: async () => [...data],
    confirmApp: async () => true,
    confirmData: async (_app, shown) => {
      shownData.push(shown);
      return true;
    },
    moveToTrash: async (path) => {
      moved.push(path);
    },
    ...overrides,
  };
  return { tools, moved, shownData };
};

test("moves the app first and then exactly the data that was shown", async () => {
  const { tools, moved, shownData } = createHarness();
  const result = await uninstallApp(APP, tools);
  assert.deepEqual(moved, [APP.path, CACHE, PREFERENCES]);
  assert.deepEqual(shownData, [DATA]);
  assert.deepEqual(result, {
    wasUninstalled: true,
    notice: "Moved Widget and 2 data items to the Trash",
  });
});

test("nothing moves when the app isn't confirmed, and data isn't asked about", async () => {
  const { tools, moved, shownData } = createHarness({ confirmApp: async () => false });
  assert.deepEqual(await uninstallApp(APP, tools), { wasUninstalled: false, notice: "" });
  assert.deepEqual(moved, []);
  assert.deepEqual(shownData, []);
});

test("answering no about data keeps it and still moves the app", async () => {
  const { tools, moved } = createHarness({ confirmData: async () => false });
  const { notice } = await uninstallApp(APP, tools);
  assert.deepEqual(moved, [APP.path]);
  assert.equal(notice, "Moved Widget to the Trash. Kept its 2 data items");
});

test("backing out of the data question leaves everything, the app included", async () => {
  const { tools, moved } = createHarness({ confirmData: async () => undefined });
  assert.deepEqual(await uninstallApp(APP, tools), { wasUninstalled: false, notice: "" });
  assert.deepEqual(moved, []);
});

test("with no data found, the data question isn't asked", async () => {
  const { tools, moved, shownData } = createHarness({}, []);
  const { notice } = await uninstallApp(APP, tools);
  assert.deepEqual(moved, [APP.path]);
  assert.deepEqual(shownData, []);
  assert.equal(notice, "Moved Widget to the Trash");
});

test("a running app is refused before any question", async () => {
  let wasAsked = false;
  const { tools, moved } = createHarness({
    isRunning: async () => true,
    confirmApp: async () => {
      wasAsked = true;
      return true;
    },
  });
  await assert.rejects(uninstallApp(APP, tools), /Quit Widget first/u);
  assert.equal(wasAsked, false);
  assert.deepEqual(moved, []);
});

test("an app opened while the questions were up is refused too", async () => {
  let checks = 0;
  const { tools, moved } = createHarness({
    isRunning: async () => {
      checks += 1;
      return checks > 1;
    },
  });
  await assert.rejects(uninstallApp(APP, tools), /Quit Widget first/u);
  assert.deepEqual(moved, []);
});

test("data stays when macOS refuses to move the app", async () => {
  const moved: string[] = [];
  const { tools } = createHarness({
    moveToTrash: async (path) => {
      moved.push(path);
      throw new Error("not permitted");
    },
  });
  await assert.rejects(uninstallApp(APP, tools), /wouldn't let Redhot move Widget/u);
  assert.deepEqual(moved, [APP.path]);
});

test("one data item that can't move doesn't stop the rest, and is reported", async () => {
  const moved: string[] = [];
  const { tools } = createHarness({
    moveToTrash: async (path) => {
      if (path === CACHE) {
        throw new Error("not permitted");
      }
      moved.push(path);
    },
  });
  await assert.rejects(
    uninstallApp(APP, tools),
    /Moved Widget to the Trash, but macOS refused .*Caches\/com\.example\.Widget/u,
  );
  assert.deepEqual(moved, [APP.path, PREFERENCES]);
});

test("paths are written from home and can't run anything in the terminal", () => {
  assert.equal(toPathLabel("/Users/me/Library/Caches/x", "/Users/me"), "~/Library/Caches/x");
  assert.equal(toPathLabel("/Users/mel/x", "/Users/me"), "/Users/mel/x");
  assert.equal(
    toPathLabel("/Applications/\u001B[31mX.app", "/Users/me"),
    "/Applications/[31mX.app",
  );
});
