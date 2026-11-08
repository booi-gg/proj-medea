import assert from "node:assert/strict";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { parseScriptCommand } from "./parse.ts";
import { keepColorsOnly, runScriptFile, toFailureLine, toLastLine, toScriptPath } from "./run.ts";
import type { Script } from "./store.ts";

const root = await realpath(await mkdtemp(join(tmpdir(), "redhot-run-test-")));
after(() => rm(root, { recursive: true, force: true }));

const makeScript = async (name: string, body: string, executable = true): Promise<Script> => {
  const path = join(root, name);
  const text = `#!/bin/bash\n# @redhot.title ${name}\n# @redhot.mode compact\n${body}\n`;
  await writeFile(path, text);
  if (executable) {
    await chmod(path, 0o755);
  }
  const command = parseScriptCommand(text);
  assert.ok(command);
  return { ...command, id: name, path };
};

test("adds Homebrew and Node's folder to a bare PATH, once each", () => {
  const path = toScriptPath("/usr/bin:/bin", "/opt/node/bin").split(":");
  assert.deepEqual(path.slice(0, 4), ["/usr/bin", "/bin", "/opt/node/bin", "/opt/homebrew/bin"]);
  assert.equal(path.filter((folder) => folder === "/usr/bin").length, 1);
});

test("keeps colours and drops other escape sequences", () => {
  const output = "\u001B[31mred\u001B[0m \u001B]0;title\u0007\u001B[2Jdone\u0007\n\tnext";
  assert.equal(keepColorsOnly(output), "\u001B[31mred\u001B[0m done\n\tnext");
});

test("the last line is the last one with text, without colours or control characters", () => {
  assert.equal(toLastLine("first\n\u001B[32msecond\u001B[0m\n\n"), "second");
  assert.equal(toLastLine("50%\r100%"), "100%");
  assert.equal(toLastLine(""), "");
});

test("runs a script with its answers, in its own folder", async () => {
  const script = await makeScript("args.sh", 'echo "$1|$2|$(pwd)"');
  const result = await runScriptFile(script, ["a b", "c"]);
  assert.deepEqual(result, { stdout: `a b|c|${root}\n`, stderr: "", failed: false });
});

test("a script finds tools in Homebrew's folder", async () => {
  const script = await makeScript("path.sh", 'echo "$PATH"');
  assert.match((await runScriptFile(script, [])).stdout, /\/opt\/homebrew\/bin/u);
});

test("a failing script reports its last error line", async () => {
  const script = await makeScript("fail.sh", 'echo working\necho "Port 3000 is free" >&2\nexit 1');
  const result = await runScriptFile(script, []);
  assert.equal(result.failed, true);
  assert.equal(toFailureLine(result, script.title), "Port 3000 is free");
  assert.equal(toFailureLine({ stdout: "", stderr: "", failed: true }, "Quiet"), "Quiet failed");
});

test("explains a script that isn't executable", async () => {
  const script = await makeScript("locked.sh", "echo hi", false);
  await assert.rejects(runScriptFile(script, []), /chmod \+x/u);
});
