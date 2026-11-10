import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { claimWindowRequest, requestWindow } from "./pending-window.ts";

const root = await mkdtemp(join(tmpdir(), "redhot-pending-test-"));
after(() => rm(root, { recursive: true, force: true }));

let folderCount = 0;
const newFolder = (): string => {
  folderCount += 1;
  return join(root, String(folderCount));
};

const NOW = 1_800_000_000_000;

test("a window takes the note left for it, once", async () => {
  const folder = newFolder();
  await requestWindow(["run-in-window", "redhot-clipboard-history:open"], folder, NOW);
  assert.deepEqual(await claimWindowRequest(folder, NOW + 500), [
    "run-in-window",
    "redhot-clipboard-history:open",
  ]);
  assert.equal(await claimWindowRequest(folder, NOW + 500), undefined);
  assert.deepEqual(await readdir(folder), []);
});

test("an extra window can take a note, with or without an item", async () => {
  const folder = newFolder();
  await requestWindow(["new-window"], folder, NOW);
  await requestWindow(["new-window", "redhot-files:search"], folder, NOW + 1);
  assert.deepEqual(await claimWindowRequest(folder, NOW + 2), ["new-window"]);
  assert.deepEqual(await claimWindowRequest(folder, NOW + 2), [
    "new-window",
    "redhot-files:search",
  ]);
});

test("no folder means no note", async () => {
  assert.equal(await claimWindowRequest(newFolder(), NOW), undefined);
});

test("two windows take the oldest notes first, one each", async () => {
  const folder = newFolder();
  await requestWindow(["run-in-window", "second"], folder, NOW + 10);
  await requestWindow(["run-in-window", "first"], folder, NOW);
  const later = NOW + 100;
  assert.deepEqual(await claimWindowRequest(folder, later), ["run-in-window", "first"]);
  assert.deepEqual(await claimWindowRequest(folder, later), ["run-in-window", "second"]);
});

test("two windows starting together never open the same item", async () => {
  const folder = newFolder();
  await requestWindow(["run-in-window", "only"], folder, NOW);
  const claims = await Promise.all([
    claimWindowRequest(folder, NOW),
    claimWindowRequest(folder, NOW),
  ]);
  assert.equal(claims.filter((claim) => claim !== undefined).length, 1);
});

test("a note too old to be wanted is cleared, not run", async () => {
  const folder = newFolder();
  await requestWindow(["run-in-window", "old"], folder, NOW);
  assert.equal(await claimWindowRequest(folder, NOW + 60_000), undefined);
  assert.deepEqual(await readdir(folder), []);
});

test("only runs the commands a window is for", async () => {
  const folder = newFolder();
  await requestWindow(["stop"], folder, NOW);
  assert.equal(await claimWindowRequest(folder, NOW), undefined);
});

test("a broken note is skipped", async () => {
  const folder = newFolder();
  await requestWindow(["run-in-window", "good"], folder, NOW + 1);
  await writeFile(join(folder, `${NOW}-broken.json`), "{not json");
  assert.deepEqual(await claimWindowRequest(folder, NOW + 2), ["run-in-window", "good"]);
});
