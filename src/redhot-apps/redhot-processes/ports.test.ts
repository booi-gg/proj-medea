import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import type { LauncherOption } from "../../launcher/prompt.ts";
import { toPortRow } from "./format.ts";
import type { RunningItem } from "./list.ts";
import {
  listPortsInUse,
  parseLsofNames,
  toPortListeners,
  toPorts,
  toProjectName,
} from "./ports.ts";
import type { PortListener } from "./ports.ts";
import { rankPorts, rankProcesses } from "./screen.ts";

const HOME = "/Users/me";
const WIDTH = 72;

const toItem = (pid: number, name = "node", isApp = false): RunningItem => ({
  pid,
  name,
  isApp,
  user: "me",
  cpuPercent: 0,
  memoryKb: 0,
  command: `/usr/bin/${name}`,
});

const listener: PortListener = { ...toItem(4242, "web (node)"), ports: [5173] };
const toPlainRow = (row: PortListener, width = WIDTH): string =>
  stripVTControlCharacters(toPortRow(row, width));

test("reads each process's names from lsof's field output", () => {
  const output = ["p636", "f10", "n*:50109", "f14", "n*:59950", "p655", "f9", "n[::1]:5173", ""];
  assert.deepEqual(
    [...parseLsofNames(output.join("\n"))],
    [
      [636, ["*:50109", "*:59950"]],
      [655, ["[::1]:5173"]],
    ],
  );
});

test("the same port on IPv4 and IPv6 counts once, and ports sort as numbers", () => {
  assert.deepEqual(toPorts(["*:7000", "[::1]:7000", "127.0.0.1:900"]), [900, 7000]);
});

test("an address with no port is skipped", () => {
  assert.deepEqual(toPorts(["*:*"]), []);
});

test("a project is the last folder, unless that says nothing about the server", () => {
  assert.equal(toProjectName("/Users/me/dev/portfolio", HOME), "portfolio");
  assert.equal(toProjectName("/", HOME), undefined);
  assert.equal(toProjectName(HOME, HOME), undefined);
  assert.equal(toProjectName(undefined, HOME), undefined);
});

test("rows go lowest port first and name the project", () => {
  const rows = toPortListeners(
    [toItem(1), toItem(2)],
    new Map([
      [1, [5174]],
      [2, [5173, 9229]],
    ]),
    new Map([[2, ["/Users/me/dev/web"]]]),
    HOME,
  );
  assert.deepEqual(
    rows.map(({ name, ports }) => [name, ports]),
    [
      ["web (node)", [5173, 9229]],
      ["node", [5174]],
    ],
  );
});

test("an app keeps its exact name, because that's how it's asked to quit", () => {
  const [row] = toPortListeners(
    [toItem(1, "Figma", true)],
    new Map([[1, [44_950]]]),
    new Map([[1, ["/Users/me/dev/web"]]]),
    HOME,
  );
  assert.equal(row?.name, "Figma");
});

test("a process that has gone since lsof ran has no row", () => {
  assert.deepEqual(toPortListeners([toItem(1)], new Map(), new Map(), HOME), []);
});

test("a row shows the port, name and process ID, and fills the width", () => {
  const row = toPlainRow(listener);
  for (const part of ["5173", "web (node)", "4242"]) {
    assert.ok(row.includes(part), part);
  }
  assert.equal(stringWidth(row), WIDTH);
});

test("rows line up, however many ports a process has", () => {
  const many = toPlainRow({ ...listener, ports: [3000, 3001, 3002, 3003, 3004, 3005] });
  assert.equal(stringWidth(many), WIDTH);
  assert.equal(many.indexOf("web"), toPlainRow(listener).indexOf("web"));
});

test("a narrow window still shows the port", () => {
  assert.ok(toPlainRow(listener, 20).startsWith("5173"));
});

const toPortOption = (...ports: readonly string[]): LauncherOption => ({
  value: ports.join(),
  name: "web (node)",
  label: ports.join(),
  aliases: ports,
});
const SERVERS = [toPortOption("5174"), toPortOption("9235", "51479"), toPortOption("5175")];
const rankedPorts = (query: string): (string | undefined)[] =>
  rankPorts(query, SERVERS).map(({ value }) => value);

test("typing digits lists the ports that start with them", () => {
  assert.deepEqual(rankedPorts("517"), ["5174", "5175"]);
  assert.deepEqual(rankedPorts(" 5175 "), ["5175"]);
});

test("a port nothing is on lists nothing, so Enter can't stop a near match", () => {
  assert.deepEqual(rankedPorts("5179"), []);
});

test("any of a process's ports finds it", () => {
  assert.deepEqual(rankedPorts("514"), ["9235,51479"]);
});

test("a name search still finds the project", () => {
  assert.equal(rankedPorts("web").length, SERVERS.length);
});

const toProcessOption = (name: string, pid: string): LauncherOption => ({
  value: pid,
  name,
  label: name,
  aliases: [pid],
});
const RUNNING = [
  toProcessOption("CharacterPalette", "51597"),
  toProcessOption("node", "4242"),
  toProcessOption("7zip", "4245"),
];
const rankedRunning = (query: string): string[] =>
  rankProcesses(query, RUNNING).map(({ name }) => name);

test("in Kill Processes a number matches a process ID from the start", () => {
  assert.deepEqual(rankedRunning("515"), ["CharacterPalette"]);
  assert.deepEqual(rankedRunning("424"), ["node", "7zip"]);
});

test("in Kill Processes a number nothing starts with lists nothing", () => {
  assert.deepEqual(rankedRunning("517"), []);
});

test("in Kill Processes a number can still find a name that starts with it", () => {
  assert.deepEqual(rankedRunning("7"), ["7zip"]);
});

test("in Kill Processes words still search names", () => {
  assert.deepEqual(rankedRunning("char"), ["CharacterPalette"]);
});

test("finds lsof in a Redhot window, whose PATH leaves out /usr/sbin", async () => {
  const { PATH } = process.env;
  process.env.PATH = "/usr/bin:/bin";
  try {
    await assert.doesNotReject(listPortsInUse());
  } finally {
    process.env.PATH = PATH;
  }
});

test("a folder's name can't put control characters on screen", () => {
  const row = toPortRow({ ...listener, name: "evil\u001B[2J" }, WIDTH);
  assert.equal(row.includes("\u001B[2J"), false);
});
