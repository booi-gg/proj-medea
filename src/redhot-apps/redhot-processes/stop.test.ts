import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import type { RunningItem } from "./list.ts";
import {
  FORCE_QUIT,
  QUIT,
  needsConfirmation,
  stopRunningItem,
  toConfirmationMessage,
} from "./stop.ts";

const ME = "me";
const SLEEP_SECONDS = "30";

const startSleeper = (): { child: ChildProcess; item: RunningItem } => {
  const child = spawn("sleep", [SLEEP_SECONDS], { stdio: "ignore" });
  assert.ok(child.pid !== undefined);
  const command = execFileSync("ps", ["-o", "comm=", "-p", String(child.pid)])
    .toString()
    .trim();
  return {
    child,
    item: {
      pid: child.pid,
      user: ME,
      cpuPercent: 0,
      memoryKb: 0,
      command,
      name: "sleep",
      isApp: false,
    },
  };
};

const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

test("quit asks the process to end, and says so once it has", async () => {
  const { child, item } = startSleeper();
  const exited = once(child, "exit");
  assert.equal(await stopRunningItem(item, QUIT, ME), "Stopped sleep");
  await exited;
  assert.equal(child.signalCode, "SIGTERM");
});

test("force quit kills the process", async () => {
  const { child, item } = startSleeper();
  const exited = once(child, "exit");
  assert.equal(await stopRunningItem(item, FORCE_QUIT, ME), "Force quit sleep");
  await exited;
  assert.equal(child.signalCode, "SIGKILL");
});

test("won't stop whatever has taken over a reused process ID", async () => {
  const { child, item } = startSleeper();
  const exited = once(child, "exit");
  await assert.rejects(
    stopRunningItem({ ...item, command: "/usr/bin/something-else" }, FORCE_QUIT, ME),
    /has already ended/u,
  );
  assert.equal(hasExited(child), false);
  child.kill("SIGKILL");
  await exited;
});

test("says so when the process is already gone", async () => {
  const { child, item } = startSleeper();
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  await assert.rejects(stopRunningItem(item, QUIT, ME), /has already ended/u);
});

const rootItem: RunningItem = {
  pid: 1,
  user: "root",
  cpuPercent: 0,
  memoryKb: 0,
  command: "/usr/sbin/thing",
  name: "thing",
  isApp: false,
};
const ownItem: RunningItem = { ...rootItem, user: ME };

test("a plain quit of your own process doesn't ask", () => {
  assert.equal(needsConfirmation(ownItem, QUIT, ME), false);
});

test("force quitting always asks", () => {
  assert.equal(needsConfirmation(ownItem, FORCE_QUIT, ME), true);
  assert.equal(needsConfirmation(rootItem, FORCE_QUIT, ME), true);
});

test("stopping something root owns asks, and says it needs sudo", () => {
  assert.equal(needsConfirmation(rootItem, QUIT, ME), true);
  assert.match(toConfirmationMessage(rootItem, QUIT, ME), /owned by root.*sudo/u);
  assert.match(toConfirmationMessage(rootItem, FORCE_QUIT, ME), /owned by root.*sudo/u);
});

test("confirmation text can't carry terminal control characters from a process name", () => {
  const message = toConfirmationMessage({ ...ownItem, name: "evil\u001B[2J" }, FORCE_QUIT, ME);
  assert.equal(message.includes("\u001B"), false);
});
