import assert from "node:assert/strict";
import { test } from "node:test";
import { toFileName, toScriptTemplate } from "./index.ts";
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
