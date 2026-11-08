import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HEADER_SCAN_LINES,
  parseScriptArgument,
  parseScriptCommand,
  prepareAnswer,
} from "./parse.ts";
import type { ScriptArgument } from "./parse.ts";

const KILL_PORT = `#!/bin/bash

# Required parameters:
# @redhot.title Kill Port
# @redhot.mode compact

# Optional parameters:
# @redhot.icon 🔪
# @redhot.packageName Developer Utils
# @redhot.description Stops whatever listens on a port
# @redhot.argument1 { "type": "text", "placeholder": "port" }
# @redhot.needsConfirmation true

kill $(lsof -ti tcp:"$1")
`;

test("reads a script command", () => {
  assert.deepEqual(parseScriptCommand(KILL_PORT), {
    title: "Kill Port",
    mode: "compact",
    icon: "🔪",
    packageName: "Developer Utils",
    description: "Stops whatever listens on a port",
    needsConfirmation: true,
    arguments: [
      { type: "text", placeholder: "port", optional: false, percentEncoded: false, choices: [] },
    ],
  });
});

test("reads scripts written with @raycast. headers, which use the same format", () => {
  const copied =
    "#!/bin/bash\n# @raycast.schemaVersion 1\n# @raycast.title Copied\n# @raycast.mode silent\n";
  assert.equal(parseScriptCommand(copied)?.title, "Copied");
  assert.equal(parseScriptCommand(copied)?.mode, "silent");
});

test("reads headers in comments from other languages", () => {
  const node = "#!/usr/bin/env node\n// @redhot.title Hello\n// @redhot.mode fullOutput\n";
  const appleScript = "#!/usr/bin/osascript\n-- @redhot.title Dark Mode\n-- @redhot.mode silent\n";
  assert.equal(parseScriptCommand(node)?.mode, "fullOutput");
  assert.equal(parseScriptCommand(appleScript)?.title, "Dark Mode");
});

test("a file without a title isn't a script command", () => {
  assert.equal(parseScriptCommand("#!/bin/bash\necho hi\n"), undefined);
  assert.equal(parseScriptCommand("# @redhot.title   \n# @redhot.mode compact"), undefined);
});

test("only reads headers near the top", () => {
  const padding = "\n".repeat(HEADER_SCAN_LINES);
  assert.equal(parseScriptCommand(`${padding}# @redhot.title Late`), undefined);
});

test("explains a missing or unknown mode instead of running", () => {
  const script = parseScriptCommand("# @redhot.title Hi\n# @redhot.mode loud");
  assert.match(script?.problem ?? "", /silent, compact, fullOutput, inline/u);
});

test("reads text, password and dropdown arguments", () => {
  assert.deepEqual(
    parseScriptArgument('{ "type": "password", "placeholder": "token", "optional": true }'),
    {
      type: "password",
      placeholder: "token",
      optional: true,
      percentEncoded: false,
      choices: [],
    },
  );
  const dropdown = parseScriptArgument(
    '{ "type": "dropdown", "data": [{ "title": "Light", "value": "light" }, { "value": "dark" }] }',
  );
  assert.deepEqual(typeof dropdown === "string" ? [] : dropdown.choices, [
    { title: "Light", value: "light" },
    { title: "dark", value: "dark" },
  ]);
  assert.equal(typeof parseScriptArgument('{ "placeholder": "x" }'), "object");
});

test("explains a broken argument", () => {
  assert.equal(parseScriptArgument("{ type: text }"), "isn't valid JSON");
  assert.equal(
    parseScriptArgument('{ "type": "number" }'),
    'needs a type of "text", "password" or "dropdown"',
  );
  assert.equal(
    parseScriptArgument('{ "type": "dropdown" }'),
    'needs a "data" list of { "title", "value" } choices',
  );
  const script = parseScriptCommand(
    "# @redhot.title Hi\n# @redhot.mode compact\n# @redhot.argument1 {",
  );
  assert.equal(script?.problem, "argument1 isn't valid JSON");
});

test("arguments go in order, up to three", () => {
  const header = (position: number) =>
    `# @redhot.argument${position} { "placeholder": "${position}" }`;
  const base = "# @redhot.title Hi\n# @redhot.mode compact\n";
  assert.equal(
    parseScriptCommand(`${base}${header(1)}\n${header(2)}\n${header(3)}`)?.arguments.length,
    3,
  );
  assert.match(parseScriptCommand(`${base}${header(2)}`)?.problem ?? "", /argument2 needs/u);
  const four = [1, 2, 3, 4].map(header).join("\n");
  assert.match(parseScriptCommand(`${base}${four}`)?.problem ?? "", /at most 3/u);
});

test("encodes an answer only when asked", () => {
  const argument: ScriptArgument = {
    type: "text",
    placeholder: "",
    optional: false,
    percentEncoded: true,
    choices: [],
  };
  assert.equal(prepareAnswer(argument, "a b&c"), "a%20b%26c");
  assert.equal(prepareAnswer({ ...argument, percentEncoded: false }, "a b"), "a b");
});
