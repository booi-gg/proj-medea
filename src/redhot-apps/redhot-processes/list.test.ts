import assert from "node:assert/strict";
import { test } from "node:test";
import { needsAdmin, parseProcessList, toPort, toRunningItems } from "./list.ts";
import type { RunningProcess } from "./list.ts";

const OWN_PID = 999;
const toProcess = (pid: number, command: string, cpuPercent = 0): RunningProcess => ({
  pid,
  user: "me",
  cpuPercent,
  memoryKb: 1024,
  command,
});

test("port followed by a number asks for that port", () => {
  assert.equal(toPort("port 3000"), 3000);
  assert.equal(toPort("PORT 8080"), 8080);
  assert.equal(toPort("port  443 "), 443);
});

test("anything else after port stays a name search", () => {
  assert.equal(toPort("port"), undefined);
  assert.equal(toPort("port "), undefined);
  assert.equal(toPort("port authority"), undefined);
  assert.equal(toPort("airport 3000"), undefined);
});

test("numbers that can't be ports aren't ports", () => {
  assert.equal(toPort("port 0"), undefined);
  assert.equal(toPort("port 65536"), undefined);
  assert.equal(toPort("port 65535"), 65_535);
});

test("reads ps output, with spaces in the command and a comma decimal", () => {
  const output = [
    "    1 root               0.4  18736 /sbin/launchd",
    "  415 me                 1,5  40544 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "",
  ].join("\n");
  assert.deepEqual(parseProcessList(output), [
    { pid: 1, user: "root", cpuPercent: 0.4, memoryKb: 18_736, command: "/sbin/launchd" },
    {
      pid: 415,
      user: "me",
      cpuPercent: 1.5,
      memoryKb: 40_544,
      command: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
  ]);
});

test("skips lines ps didn't format as a process", () => {
  assert.deepEqual(parseProcessList("not a process line"), []);
});

test("lists running apps first by name, then other processes busiest first", () => {
  const items = toRunningItems(
    [
      toProcess(10, "/usr/bin/quiet", 0.1),
      toProcess(11, "/Applications/Zed.app/Contents/MacOS/Zed"),
      toProcess(12, "/usr/bin/busy", 50),
      toProcess(13, "/Applications/Arc.app/Contents/MacOS/Arc"),
    ],
    new Set(["Arc", "Zed", "Mail"]),
    OWN_PID,
  );
  assert.deepEqual(
    items.map(({ name, isApp }) => [name, isApp]),
    [
      ["Arc", true],
      ["Zed", true],
      ["busy", false],
      ["quiet", false],
    ],
  );
});

test("finds an app macOS runs from a system volume, like Safari", () => {
  const command =
    "/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari";
  const [item] = toRunningItems([toProcess(10, command)], new Set(["Safari"]), OWN_PID);
  assert.equal(item?.name, "Safari");
  assert.equal(item?.isApp, true);
});

test("helpers inside an app are processes, so quitting one can't be mistaken for the app", () => {
  const items = toRunningItems(
    [
      toProcess(
        10,
        "/Applications/Arc.app/Contents/Frameworks/Arc Helper.app/Contents/MacOS/Arc Helper",
      ),
    ],
    new Set(["Arc"]),
    OWN_PID,
  );
  assert.equal(items[0]?.name, "Arc Helper");
  assert.equal(items[0]?.isApp, false);
});

test("the program named after the app is the app, whichever started first", () => {
  const items = toRunningItems(
    [
      toProcess(10, "/Applications/Arc.app/Contents/MacOS/crash-reporter"),
      toProcess(11, "/Applications/Arc.app/Contents/MacOS/Arc"),
    ],
    new Set(["Arc"]),
    OWN_PID,
  );
  assert.equal(items.find(({ isApp }) => isApp)?.pid, 11);
  assert.equal(items.find(({ isApp }) => !isApp)?.name, "crash-reporter");
});

test("leaves Redhot's own process out", () => {
  const items = toRunningItems([toProcess(OWN_PID, "/usr/bin/node")], new Set(), OWN_PID);
  assert.deepEqual(items, []);
});

test("a process owned by someone else needs admin", () => {
  const [item] = toRunningItems(
    [{ ...toProcess(1, "/sbin/launchd"), user: "root" }],
    new Set(),
    OWN_PID,
  );
  assert.ok(item !== undefined);
  assert.equal(needsAdmin(item, "me"), true);
  assert.equal(needsAdmin(item, "root"), false);
});
