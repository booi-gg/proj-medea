import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { rotateLogs, scrubError, scrubItem, writeLog } from "./log.ts";

const runFile = promisify(execFile);

test("writes JSON lines with process metadata and no private content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redhot-log-test-"));
  try {
    writeLog(
      "item.run",
      {
        item: "/Applications/My App.app",
        program: "/usr/bin/open",
        error: new Error("https://secret.example/token?password=abc"),
      },
      { directory },
    );
    const line = await readFile(join(directory, "redhot.log"), "utf8");
    const entry = JSON.parse(line);
    assert.match(entry.ts, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
    assert.equal(entry.pid, process.pid);
    assert.equal(entry.ppid, process.ppid);
    assert.equal(entry.item, "app:My_App.app");
    assert.equal(entry.program, "open");
    assert.equal(entry.error, "Error");
    assert.equal(line.includes("secret.example"), false);
    assert.equal(scrubItem("356 USD to INR"), "other");
    assert.equal(scrubError(Object.assign(new Error("secret"), { code: "ENOENT" })), "ENOENT");
    assert.equal(
      scrubError(Object.assign(new Error("secret"), { code: "secret-token-123" })),
      "Error",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rotation keeps a unique archive and prunes oldest files to the limit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redhot-log-rotate-"));
  try {
    await writeFile(
      join(directory, "redhot.20260101T000000000Z-1-aaaaaaaa.log"),
      "x".repeat(8_000),
    );
    await writeFile(join(directory, "redhot.log"), "y".repeat(2_000));
    rotateLogs(directory, 0.005);
    const names = await readdir(directory);
    assert.equal(names.includes("redhot.log"), false);
    assert.equal(names.includes("redhot.20260101T000000000Z-1-aaaaaaaa.log"), false);
    assert.equal(names.filter((name) => name.endsWith(".log")).length, 1);
    const size = (await stat(join(directory, names[0]))).size;
    assert.ok(size <= 0.005 * 1024 * 1024);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("lowering the limit prunes archives before the active file reaches rotation size", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redhot-log-limit-"));
  try {
    await writeFile(
      join(directory, "redhot.20260101T000000000Z-1-aaaaaaaa.log"),
      "x".repeat(8_000),
    );
    await writeFile(join(directory, "redhot.log"), "y".repeat(100));
    rotateLogs(directory, 0.005, true);
    assert.deepEqual(await readdir(directory), ["redhot.log"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("concurrent processes append complete, distinct lines", async () => {
  const directory = await mkdtemp(join(tmpdir(), "redhot-log-concurrent-"));
  try {
    const script =
      "import { writeLog } from './src/log.ts'; for (let i = 0; i < 100; i++) writeLog('stress.write', { count: i });";
    await Promise.all(
      Array.from({ length: 4 }, () =>
        runFile(process.execPath, ["--input-type=module", "-e", script], {
          cwd: join(import.meta.dirname, ".."),
          env: { ...process.env, REDHOT_LOG_DIR: directory },
        }),
      ),
    );
    const lines = (await readFile(join(directory, "redhot.log"), "utf8")).trim().split("\n");
    assert.equal(lines.length, 400);
    const ids = new Set(lines.map((line) => JSON.parse(line).id));
    assert.equal(ids.size, 400);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
