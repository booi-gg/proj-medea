import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { findAppData, toAppIdentity } from "./match.ts";
import type { AppDataItem, AppIdentity } from "./match.ts";

const BUNDLE_ID = "com.example.Widget";
const WIDGET: AppIdentity = { bundleId: BUNDLE_ID, names: ["Widget"] };

let root = "";
let library = "";

before(async () => {
  root = await mkdtemp(join(tmpdir(), "redhot-uninstall-"));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  library = await mkdtemp(join(root, "library-"));
});

afterEach(async () => {
  await rm(library, { recursive: true, force: true });
});

const addFiles = async (paths: readonly string[]): Promise<void> => {
  await Promise.all(
    paths.map(async (path) => {
      await mkdir(dirname(join(library, path)), { recursive: true });
      await writeFile(join(library, path), "");
    }),
  );
};

const toRelative = (items: readonly AppDataItem[]): string[] =>
  items.map(({ path }) => path.slice(library.length + 1)).toSorted();

const findFor = async (
  app: AppIdentity = WIDGET,
  protectedPaths: readonly string[] = [],
): Promise<string[]> => toRelative(await findAppData(app, library, protectedPaths));

test("finds an app's data by its bundle ID in every place apps keep it", async () => {
  const expected = [
    `Application Scripts/${BUNDLE_ID}`,
    `Application Support/${BUNDLE_ID}`,
    `Caches/${BUNDLE_ID}`,
    `Containers/${BUNDLE_ID}`,
    `Cookies/${BUNDLE_ID}.binarycookies`,
    `Group Containers/group.${BUNDLE_ID}`,
    `HTTPStorages/${BUNDLE_ID}`,
    `HTTPStorages/${BUNDLE_ID}.binarycookies`,
    `LaunchAgents/${BUNDLE_ID}.plist`,
    `Logs/${BUNDLE_ID}`,
    `Preferences/${BUNDLE_ID}.plist`,
    `Preferences/ByHost/${BUNDLE_ID}.01234567-89AB-CDEF-0123-456789ABCDEF.plist`,
    `Saved Application State/${BUNDLE_ID}.savedState`,
    `WebKit/${BUNDLE_ID}`,
  ];
  await addFiles(expected);
  assert.deepEqual(await findFor(), expected.toSorted());
});

test("says how each item was matched, so a name match can be pointed out", async () => {
  await addFiles([`Caches/${BUNDLE_ID}`, "Application Support/Widget"]);
  const items = await findAppData(WIDGET, library, []);
  assert.deepEqual(
    items.map(({ matchedBy }) => matchedBy),
    ["name", "bundle-id"],
  );
});

test("matches regardless of case, like the disk does", async () => {
  await addFiles([`Caches/${BUNDLE_ID.toUpperCase()}`, "Logs/WIDGET"]);
  assert.deepEqual(await findFor(), [`Caches/${BUNDLE_ID.toUpperCase()}`, "Logs/WIDGET"]);
});

test("an app's own helpers count as its data", async () => {
  const helpers = [
    `Caches/${BUNDLE_ID}.ShipIt`,
    `Application Support/${BUNDLE_ID}.helper`,
    `Preferences/${BUNDLE_ID}.LoginHelper.plist`,
  ];
  await addFiles(helpers);
  assert.deepEqual(await findFor(), helpers.toSorted());
});

test("another app whose ID merely starts with this one's isn't offered", async () => {
  const chrome = { bundleId: "com.google.Chrome", names: [] };
  await addFiles([
    "Application Support/com.google.Chrome.canary",
    "Caches/com.google.Chrome.beta",
    "Containers/com.google.ChromeRemoteDesktop",
    "Preferences/com.google.Chrome.canary.plist",
    "Saved Application State/com.google.Chrome.canary.savedState",
  ]);
  assert.deepEqual(await findFor(chrome), []);
});

test("the wrong kind of file for a folder isn't offered", async () => {
  await addFiles([
    `Preferences/${BUNDLE_ID}`,
    `Preferences/${BUNDLE_ID}.plist.backup`,
    `Saved Application State/${BUNDLE_ID}`,
    `LaunchAgents/${BUNDLE_ID}`,
    `Cookies/${BUNDLE_ID}`,
    `Preferences/ByHost/${BUNDLE_ID}.plist`,
  ]);
  assert.deepEqual(await findFor(), []);
});

test("a folder name only matches the whole name", async () => {
  await addFiles([
    "Application Support/Widget Pro",
    "Application Support/WidgetHelper",
    "Application Support/My Widget",
    "Caches/Widget.old",
    "Logs/Widgets",
  ]);
  assert.deepEqual(await findFor(), []);
});

test("a name is only looked for where apps use their names", async () => {
  await addFiles([
    "Containers/Widget",
    "Preferences/Widget.plist",
    "Group Containers/Widget",
    "WebKit/Widget",
    "LaunchAgents/Widget.plist",
    "Saved Application State/Widget.savedState",
  ]);
  assert.deepEqual(await findFor(), []);
});

test("group containers need the app's whole ID", async () => {
  const groups = [
    `Group Containers/ABCDE12345.${BUNDLE_ID}`,
    `Group Containers/ABCDE12345.group.${BUNDLE_ID}`,
  ];
  await addFiles([
    ...groups,
    "Group Containers/ABCDE12345.Office",
    "Group Containers/group.com.example",
    `Group Containers/group.${BUNDLE_ID}Beta`,
  ]);
  assert.deepEqual(await findFor(), groups.toSorted());
});

test("nothing is found outside the known folders or below their first level", async () => {
  await addFiles([
    `Documents/${BUNDLE_ID}`,
    `Mail/${BUNDLE_ID}`,
    `Application Support/Other/${BUNDLE_ID}`,
    "Application Support/Other/Widget",
  ]);
  assert.deepEqual(await findFor(), []);
});

test("a missing folder doesn't stop the rest from being found", async () => {
  await addFiles([`Caches/${BUNDLE_ID}`]);
  assert.deepEqual(await findFor(), [`Caches/${BUNDLE_ID}`]);
});

test("Redhot's own files are never offered, even to an app with its name", async () => {
  const redhot = { bundleId: "redhot.menu-bar", names: ["Redhot"] };
  await addFiles([
    "Application Support/Redhot/helper.log",
    "Logs/Redhot/redhot.log",
    "LaunchAgents/redhot.menu-bar.plist",
    "Caches/Redhot",
  ]);
  const protectedPaths = [
    join(library, "Application Support", "redhot"),
    join(library, "Logs", "Redhot"),
    join(library, "LaunchAgents", "redhot.menu-bar.plist"),
  ];
  assert.deepEqual(await findFor(redhot, protectedPaths), ["Caches/Redhot"]);
});

test("a folder that holds one of Redhot's files is never offered either", async () => {
  await addFiles(["Application Support/Widget/inner/redhot.sock"]);
  const nestedPath = join(library, "Application Support", "Widget", "inner", "redhot.sock");
  assert.deepEqual(await findFor(WIDGET, [nestedPath]), []);
});

const identify = (
  overrides: Partial<Parameters<typeof toAppIdentity>[0]> = {},
): AppIdentity | undefined =>
  toAppIdentity({
    bundleId: BUNDLE_ID,
    appName: "Widget",
    bundleName: undefined,
    otherAppNames: [],
    ...overrides,
  });

test("an app with no usable ID gets no identity, so no data is matched", () => {
  assert.equal(identify({ bundleId: undefined }), undefined);
  assert.equal(identify({ bundleId: "" }), undefined);
  assert.equal(identify({ bundleId: "widget" }), undefined);
  assert.equal(identify({ bundleId: "../../Documents" }), undefined);
  assert.equal(identify({ bundleId: "com.example.*" }), undefined);
});

test("uses both the app's file name and its bundle name", () => {
  const app = identify({ appName: "Visual Studio Code", bundleName: "Code" });
  assert.deepEqual(app?.names, ["Visual Studio Code", "Code"]);
});

test("generic and vendor names are never used to match a folder", () => {
  for (const name of ["Google", "microsoft", "Adobe", "Electron", "Helper", "Data", "Updater"]) {
    assert.deepEqual(identify({ appName: name })?.names, [], name);
  }
});

test("very short names are never used to match a folder", () => {
  assert.deepEqual(identify({ appName: "Go" })?.names, []);
  assert.deepEqual(identify({ appName: "Zed" })?.names, ["Zed"]);
});

test("a name another installed app goes by isn't used", () => {
  const beta = identify({
    appName: "Widget Beta",
    bundleName: "Widget",
    otherAppNames: ["widget", "Notes"],
  });
  assert.deepEqual(beta?.names, ["Widget Beta"]);
});

test("Apple's apps only ever match by ID", () => {
  const xcode = identify({ bundleId: "com.apple.dt.Xcode", appName: "Xcode", bundleName: "Xcode" });
  assert.deepEqual(xcode?.names, []);
});
