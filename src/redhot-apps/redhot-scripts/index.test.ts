import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import { scripts, toFileName, toScriptRow, toScriptTemplate } from "./index.ts";
import { parseScriptCommand } from "./parse.ts";

test("names a new script after its title without overwriting another", () => {
  const taken = new Set(["kill-port.sh", "kill-port-2.sh"]);
  assert.equal(
    toFileName("Kill Port!", (name) => taken.has(name)),
    "kill-port-3.sh",
  );
  assert.equal(
    toFileName("Open Downloads", () => false),
    "open-downloads.sh",
  );
  assert.equal(
    toFileName("🔥", () => false),
    "script.sh",
  );
});

test("a new script's template reads back with its title and mode, and no arguments", () => {
  const command = parseScriptCommand(toScriptTemplate("Kill Port", "fullOutput"));
  assert.equal(command?.title, "Kill Port");
  assert.equal(command?.mode, "fullOutput");
  assert.deepEqual(command?.arguments, []);
  assert.equal(command?.problem, undefined);
});

const toPlainRow = (icon: string, name: string, hint?: string): string =>
  stripVTControlCharacters(
    toScriptRow(
      { value: "x", name, icon, ...(hint === undefined ? {} : { hint }), run: async () => "" },
      undefined,
    ),
  );

test("script rows keep their columns with wide icons and long titles", () => {
  const narrow = toPlainRow("$", "Sleep", "System");
  const emoji = toPlainRow("😴", "Sleep", "System");
  const long = toPlainRow("💻", "Capture Screen Selection to Clipboard And More", "System");
  assert.equal(stringWidth(narrow), stringWidth(emoji));
  assert.equal(stringWidth(narrow), stringWidth(long));
  assert.match(long, /…/u);
});

test("a script row fits the 80-column window", () => {
  const row = toPlainRow("💻", "x".repeat(60), "y".repeat(60));
  assert.ok(stringWidth(row) <= 80);
});

test("search lists the create, show all and open folder commands", () => {
  const names = scripts.listItems().map(({ name }) => name);
  for (const name of ["Script, Create", "Scripts, Show All", "Scripts, Open Folder"]) {
    assert.ok(names.includes(name));
  }
});
