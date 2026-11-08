import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import type { RunningItem } from "./list.ts";
import { createProcessSearch } from "./search.ts";

const toItem = (pid: number, name: string): RunningItem => ({
  pid,
  name,
  user: "me",
  cpuPercent: 0,
  memoryKb: 0,
  command: name,
  isApp: false,
});

const NAMES = (items: readonly RunningItem[]): string[] => items.map(({ name }) => name);
const ALL = [toItem(1, "node"), toItem(2, "ruby")];

test("lists everything until the text asks for a port", async () => {
  const search = createProcessSearch({ loadAll: async () => ALL, loadPort: async () => [] });
  await search.reload("");
  assert.deepEqual(NAMES(search.getResults()), ["node", "ruby"]);
  assert.equal(search.getPort(), undefined);
});

test("a reload waits for the port's listeners, so the list opens with them", async () => {
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async (port) => [toItem(port, `listener-${port}`)],
  });
  await search.reload("port 3000");
  assert.deepEqual(NAMES(search.getResults()), ["listener-3000"]);
  assert.equal(search.isSearching(), false);
});

test("typing a port shows it's looking, then the listeners and tells the list", async () => {
  let changes = 0;
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async () => [toItem(7, "server")],
    delayMs: 1,
  });
  search.setOnChange(() => {
    changes += 1;
  });
  await search.reload("");
  search.setQuery("port 3000");
  assert.equal(search.isSearching(), true);
  assert.deepEqual(search.getResults(), []);
  await sleep(20);
  assert.equal(search.isSearching(), false);
  assert.deepEqual(NAMES(search.getResults()), ["server"]);
  assert.equal(changes, 1);
});

test("only the last port typed is looked up", async () => {
  const asked: number[] = [];
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async (port) => {
      asked.push(port);
      return [];
    },
    delayMs: 5,
  });
  search.setQuery("port 3");
  search.setQuery("port 30");
  search.setQuery("port 300");
  await sleep(30);
  assert.deepEqual(asked, [300]);
});

test("a slow answer for an old port doesn't replace the current one", async () => {
  let releaseFirst: (items: RunningItem[]) => void = () => {};
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async (port) =>
      port === 1000
        ? new Promise<RunningItem[]>((resolve) => {
            releaseFirst = resolve;
          })
        : [toItem(port, "current")],
    delayMs: 1,
  });
  search.setQuery("port 1000");
  await sleep(10);
  search.setQuery("port 2000");
  await sleep(10);
  releaseFirst([toItem(1000, "stale")]);
  await sleep(10);
  assert.deepEqual(NAMES(search.getResults()), ["current"]);
});

test("the same port isn't looked up twice, so the list doesn't flicker as it opens", async () => {
  let lookups = 0;
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async () => {
      lookups += 1;
      return [toItem(7, "server")];
    },
    delayMs: 1,
  });
  await search.reload("port 3000");
  search.setQuery("port 3000");
  await sleep(10);
  assert.equal(lookups, 1);
  assert.deepEqual(NAMES(search.getResults()), ["server"]);
});

test("going back to a name search returns to the full list", async () => {
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async () => [toItem(7, "server")],
  });
  await search.reload("port 3000");
  search.setQuery("port");
  assert.deepEqual(NAMES(search.getResults()), ["node", "ruby"]);
  assert.equal(search.isSearching(), false);
});

test("a failed lookup ends the search instead of looking forever", async () => {
  const search = createProcessSearch({
    loadAll: async () => ALL,
    loadPort: async () => {
      throw new Error("lsof broke");
    },
  });
  await search.reload("port 3000");
  assert.equal(search.isSearching(), false);
  assert.deepEqual(search.getResults(), []);
});
