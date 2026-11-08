import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { test } from "node:test";
import stringWidth from "string-width";
import { toMemoryLabel, toRunningRow } from "./format.ts";
import type { RunningItem } from "./list.ts";

const ME = "me";
const WIDTH = 80;
const item: RunningItem = {
  pid: 1234,
  user: ME,
  cpuPercent: 12.34,
  memoryKb: 2048,
  command: "/usr/bin/node",
  name: "node",
  isApp: false,
};

const toPlainRow = (row: RunningItem, width = WIDTH): string =>
  stripVTControlCharacters(toRunningRow(row, width, ME));

test("memory reads in MB, then GB", () => {
  assert.equal(toMemoryLabel(2048), "2 MB");
  assert.equal(toMemoryLabel(3 * 1024 * 1024), "3.0 GB");
});

test("a row shows the name, process ID, CPU and memory", () => {
  const row = toPlainRow(item);
  for (const part of ["node", "Process", "1234", "12.3%", "2 MB"]) {
    assert.ok(row.includes(part), part);
  }
});

test("a row says App for an app, and names the owner when it isn't you", () => {
  assert.ok(toPlainRow({ ...item, isApp: true }).includes("App"));
  assert.ok(toPlainRow({ ...item, user: "root" }).includes("root"));
});

test("rows line up, whatever the name's length", () => {
  const short = toPlainRow({ ...item, name: "a" });
  const long = toPlainRow({ ...item, name: "a much longer process name" });
  assert.equal(stringWidth(short), stringWidth(long));
  assert.equal(stringWidth(short), WIDTH);
});

test("a very long name is cut so the columns still fit", () => {
  assert.equal(stringWidth(toPlainRow({ ...item, name: "x".repeat(200) })), WIDTH);
});

test("a narrow window shows only the name", () => {
  assert.equal(toPlainRow(item, 20), "node");
});

test("a process name can't put control characters on screen", () => {
  assert.equal(
    toRunningRow({ ...item, name: "evil\u001B[2J" }, WIDTH, ME).includes("\u001B[2J"),
    false,
  );
});
