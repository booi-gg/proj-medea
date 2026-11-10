import assert from "node:assert/strict";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isBuildCurrent, markBuilt, moduleCachePath } from "./swift-build.ts";

// npm gives every file in a published package this date.
const NPM_PACKAGE_DATE = new Date("1985-10-26T08:15:00Z");

const withFolder = async (run: (folder: string) => Promise<void>): Promise<void> => {
  const folder = await mkdtemp(join(tmpdir(), "redhot-swift-build-"));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
};

test("a moved project gets its own module cache", () => {
  assert.notEqual(
    moduleCachePath("/Users/me/old-name/.build"),
    moduleCachePath("/Users/me/new-name/.build"),
  );
});

test("the module cache stays put between builds and inside the build folder", () => {
  const outputDir = "/Users/me/project/.build";
  assert.equal(moduleCachePath(outputDir), moduleCachePath(outputDir));
  assert.ok(moduleCachePath(outputDir).startsWith(`${outputDir}/clang-module-cache/`));
});

test("a missing binary needs a build", () =>
  withFolder(async (folder) => {
    const source = join(folder, "main.swift");
    await writeFile(source, "print(1)");
    assert.equal(await isBuildCurrent([source], join(folder, "binary")), false);
  }));

test("a binary built from the same sources is current", () =>
  withFolder(async (folder) => {
    const source = join(folder, "main.swift");
    const binary = join(folder, "binary");
    await writeFile(source, "print(1)");
    await writeFile(binary, "");
    await markBuilt([source], binary);
    assert.equal(await isBuildCurrent([source], binary), true);
  }));

test("changed sources need a build even when they look older than the binary", () =>
  withFolder(async (folder) => {
    const source = join(folder, "main.swift");
    const binary = join(folder, "binary");
    await writeFile(source, "print(1)");
    await writeFile(binary, "");
    await markBuilt([source], binary);
    await writeFile(source, "print(2)");
    await utimes(source, NPM_PACKAGE_DATE, NPM_PACKAGE_DATE);
    assert.equal(await isBuildCurrent([source], binary), false);
  }));
