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
  setSyncChoice,
  syncNow,
  toSyncFolderName,
} from "./sync.ts";
import type { SyncPaths } from "./sync.ts";

const root = await mkdtemp(join(tmpdir(), "redhot-sync-test-"));
after(async () => rm(root, { recursive: true, force: true }));

const pathsFor = (name: string): SyncPaths => {
  const directory = join(root, name);
  return {
    config: join(directory, "config.json"),
    quicklinks: join(directory, "quicklinks.json"),
    snippets: join(directory, "snippets.json"),
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
      checkForUpdates: true,
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
      checkForUpdates: false,
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
  assert.equal(config.checkForUpdates, false);
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

const makeMacs = async (
  name: string,
): Promise<{ cloud: string; first: SyncPaths; second: SyncPaths }> => {
  const cloud = join(root, `cloud-${name}`);
  const first = pathsFor(`${name}-first`);
  const second = pathsFor(`${name}-second`);
  await mkdir(cloud, { recursive: true });
  await mkdir(join(root, `${name}-first`), { recursive: true });
  await mkdir(join(root, `${name}-second`), { recursive: true });
  await configureSync(cloud, first);
  await configureSync(cloud, second);
  return { cloud, first, second };
};

const syncBoth = async (first: SyncPaths, second: SyncPaths): Promise<void> => {
  await syncNow(first);
  await syncNow(second);
};

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8"));

const link = (name: string): { id: string; name: string; link: string } => ({
  id: "docs",
  name,
  link: "https://example.com",
});

const SECRET_TEXT = "1 Private Road";
const addressSnippet = { id: "address", name: "Address", keyword: ";addr", text: SECRET_TEXT };

test("snippets stay on this Mac until they're switched on", async () => {
  const { cloud, first, second } = await makeMacs("snippets");
  await writeFile(first.snippets, JSON.stringify([addressSnippet]));
  assert.equal((await readSyncStatus(first)).snippetsEnabled, false);
  await syncBoth(first, second);

  const firstId = (await readSyncStatus(first)).deviceId ?? "";
  const changes = join(cloud, "devices", firstId, "changes");
  for (const name of await readdir(changes).catch(() => [])) {
    assert.ok(!(await readFile(join(changes, name), "utf8")).includes(SECRET_TEXT));
  }
  await assert.rejects(readFile(second.snippets, "utf8"));

  await setSyncChoice("snippetsEnabled", true, first);
  await setSyncChoice("snippetsEnabled", true, second);
  await syncBoth(first, second);
  assert.deepEqual(await readJson(second.snippets), [addressSnippet]);
});

test("a snippets file that can't be read doesn't stop sync while they're off", async () => {
  const { first, second } = await makeMacs("broken");
  await writeFile(first.snippets, "{ not json");
  await writeFile(first.quicklinks, JSON.stringify([link("Docs")]));
  await syncBoth(first, second);
  assert.deepEqual(await readJson(second.quicklinks), [link("Docs")]);
  assert.equal(await readFile(first.snippets, "utf8"), "{ not json");
});

test("a snippet too long for one change is refused before it can reach the other Macs", async () => {
  const { first } = await makeMacs("long");
  await writeFile(
    first.snippets,
    JSON.stringify([{ ...addressSnippet, text: "x".repeat(50_000) }]),
  );
  await setSyncChoice("snippetsEnabled", true, first);
  await assert.rejects(syncNow(first), /too long to sync/);
});

test("switching something off doesn't read as deleting it on other Macs", async () => {
  const { first, second } = await makeMacs("off");
  await writeFile(first.quicklinks, JSON.stringify([link("Docs")]));
  await syncBoth(first, second);
  await setSyncChoice("quicklinksEnabled", false, first);
  await writeFile(first.quicklinks, "[]");
  await syncBoth(first, second);
  assert.deepEqual(await readJson(second.quicklinks), [link("Docs")]);
});

test("a Mac catches up on changes made while it was off, with no false conflict", async () => {
  const { first, second } = await makeMacs("catch-up");
  await writeFile(first.quicklinks, JSON.stringify([link("Docs")]));
  await syncBoth(first, second);

  await setSyncChoice("quicklinksEnabled", false, second);
  await writeFile(first.quicklinks, JSON.stringify([link("Docs two")]));
  await syncBoth(first, second);
  await writeFile(first.quicklinks, JSON.stringify([link("Docs three")]));
  await syncBoth(first, second);
  assert.deepEqual(await readJson(second.quicklinks), [link("Docs")]);

  await setSyncChoice("quicklinksEnabled", true, second);
  await syncNow(second);
  assert.deepEqual(await readJson(second.quicklinks), [link("Docs three")]);
  assert.equal((await readSyncStatus(second)).conflicts, 0);
});

test("each kind is switched separately", async () => {
  const { first, second } = await makeMacs("separate");
  await setSyncChoice("settingsEnabled", false, first);
  await writeFile(
    first.config,
    JSON.stringify({ aliases: {}, hotkeys: { "command:exit": "cmd+1" } }),
  );
  await writeFile(first.quicklinks, JSON.stringify([link("Docs")]));
  await syncBoth(first, second);
  assert.deepEqual(await readJson(second.quicklinks), [link("Docs")]);
  assert.deepEqual(JSON.parse(await readFile(second.config, "utf8")).hotkeys, {});
});

test("a conflict in something switched off can't be restored until it's back on", async () => {
  const { first, second } = await makeMacs("conflict-off");
  const withHotkey = (key: string): string =>
    JSON.stringify({ aliases: {}, hotkeys: { "command:exit": key } });
  await writeFile(first.config, withHotkey("cmd+1"));
  await syncBoth(first, second);
  await writeFile(first.config, withHotkey("cmd+2"));
  await syncNow(first);
  await writeFile(second.config, withHotkey("cmd+3"));
  await syncNow(second);
  await setSyncChoice("settingsEnabled", false, second);
  await assert.rejects(resolveSyncConflict("hotkey:command:exit", true, second), /What to Sync/);
  assert.equal((await readSyncStatus(second)).conflicts, 1);
});

test("moving to another folder shares everything there and keeps a pause", async () => {
  const { first, second } = await makeMacs("move");
  await writeFile(first.quicklinks, JSON.stringify([link("Docs")]));
  await syncNow(first);

  const newCloud = join(root, "cloud-moved");
  await mkdir(newCloud, { recursive: true });
  await configureSync(newCloud, first);
  await configureSync(newCloud, second);
  await syncBoth(first, second);
  assert.equal((await readSyncStatus(first)).folder, newCloud);
  assert.deepEqual(await readJson(second.quicklinks), [link("Docs")]);

  await changeSyncSettings({ paused: true }, first);
  await configureSync(join(root, "cloud-move"), first);
  assert.equal((await readSyncStatus(first)).paused, true);
});

test("shows a sync folder by its name", () => {
  const drive = "/Users/me/Library/Mobile Documents/com~apple~CloudDocs";
  assert.equal(toSyncFolderName(`${drive}/Redhot Sync`), "Redhot Sync");
  assert.equal(toSyncFolderName(drive), "iCloud Drive");
});
