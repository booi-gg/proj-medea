import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  changeSyncSettings,
  configureSync,
  listSyncConflicts,
  readSyncStatus,
  resolveSyncConflict,
  syncNow,
} from "./sync.ts";
import type { SyncPaths } from "./sync.ts";

const root = await mkdtemp(join(tmpdir(), "redhot-sync-test-"));
after(async () => rm(root, { recursive: true, force: true }));

const pathsFor = (name: string): SyncPaths => {
  const directory = join(root, name);
  return {
    config: join(directory, "config.json"),
    quicklinks: join(directory, "quicklinks.json"),
    state: join(directory, "sync-state.json"),
    outbox: join(directory, "outbox"),
    logs: join(directory, "logs"),
    coordinated: false,
  };
};

test("syncs portable settings and links while preserving Mac-specific choices", async () => {
  const cloud = join(root, "cloud-one");
  const first = pathsFor("first");
  const second = pathsFor("second");
  await mkdir(cloud, { recursive: true });
  await mkdir(join(root, "first"), { recursive: true });
  await mkdir(join(root, "second"), { recursive: true });
  await writeFile(
    first.config,
    JSON.stringify({
      terminal: "Ghostty",
      aliases: { "command:exit": ["bye"], "/Applications/Foo.app": ["foo"] },
      hotkeys: { "redhot-logs:view": "cmd+l" },
      clipboardHistoryMonths: 4,
    }),
  );
  await writeFile(
    first.quicklinks,
    JSON.stringify([
      {
        id: "docs",
        name: "Docs",
        link: "https://example.com",
        openWith: "/Applications/Safari.app",
      },
    ]),
  );
  await writeFile(
    second.config,
    JSON.stringify({
      terminal: "Terminal",
      aliases: {},
      hotkeys: {},
    }),
  );
  await configureSync(cloud, first);
  await configureSync(cloud, second);
  await syncNow(first);
  await syncNow(second);

  const config = JSON.parse(await readFile(second.config, "utf8"));
  const links = JSON.parse(await readFile(second.quicklinks, "utf8"));
  assert.equal(config.terminal, "Terminal");
  assert.deepEqual(config.aliases, { "command:exit": ["bye"] });
  assert.deepEqual(config.hotkeys, { "redhot-logs:view": "cmd+l" });
  assert.equal(config.clipboardHistoryMonths, 4);
  assert.deepEqual(links, [{ id: "docs", name: "Docs", link: "https://example.com" }]);
  assert.ok((await readSyncStatus(second)).lastSyncAt);

  await writeFile(second.quicklinks, "[]");
  await syncNow(second);
  await syncNow(first);
  assert.deepEqual(JSON.parse(await readFile(first.quicklinks, "utf8")), []);
});

test("keeps offline edits, syncs logs by device, and reports an unavailable folder", async () => {
  const cloud = join(root, "cloud-two");
  const first = pathsFor("third");
  const second = pathsFor("fourth");
  await mkdir(cloud, { recursive: true });
  await mkdir(join(root, "third"), { recursive: true });
  await mkdir(join(root, "fourth"), { recursive: true });
  await mkdir(first.logs, { recursive: true });
  await writeFile(join(first.logs, "redhot.log"), '{"event":"sample"}\n');
  await configureSync(cloud, first);
  await configureSync(cloud, second);
  await syncNow(first);
  await syncNow(second);
  const firstId = (await readSyncStatus(first)).deviceId;
  const syncedDirectory = join(second.logs, "synced", firstId ?? "");
  const [fileName] = await readdir(syncedDirectory);
  const mirrored = await readFile(join(syncedDirectory, fileName ?? ""), "utf8");
  assert.equal(mirrored, '{"event":"sample"}\n');

  await rm(cloud, { recursive: true });
  await assert.rejects(syncNow(first));
  assert.match((await readSyncStatus(first)).error ?? "", /ENOENT|unavailable/);
  await changeSyncSettings({ paused: true }, first);
  assert.equal((await readSyncStatus(first)).paused, true);
});

test("records concurrent edits and can restore the other version", async () => {
  const cloud = join(root, "cloud-three");
  const first = pathsFor("fifth");
  const second = pathsFor("sixth");
  await mkdir(cloud, { recursive: true });
  await mkdir(join(root, "fifth"), { recursive: true });
  await mkdir(join(root, "sixth"), { recursive: true });
  await writeFile(
    first.config,
    JSON.stringify({ aliases: {}, hotkeys: { "command:exit": "cmd+1" } }),
  );
  await configureSync(cloud, first);
  await configureSync(cloud, second);
  await syncNow(first);
  await syncNow(second);

  await writeFile(
    first.config,
    JSON.stringify({ aliases: {}, hotkeys: { "command:exit": "cmd+2" } }),
  );
  await syncNow(first);
  await writeFile(
    second.config,
    JSON.stringify({ aliases: {}, hotkeys: { "command:exit": "cmd+3" } }),
  );
  await syncNow(second);
  assert.equal((await readSyncStatus(second)).conflicts, 1);
  assert.equal((await listSyncConflicts(second))[0]?.key, "hotkey:command:exit");

  await resolveSyncConflict("hotkey:command:exit", true, second);
  assert.equal(JSON.parse(await readFile(second.config, "utf8")).hotkeys["command:exit"], "cmd+2");
  assert.equal((await readSyncStatus(second)).conflicts, 0);
  await syncNow(second);
  await syncNow(first);
  assert.equal(JSON.parse(await readFile(first.config, "utf8")).hotkeys["command:exit"], "cmd+2");
});
