import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { listScripts } from "./store.ts";

const root = await mkdtemp(join(tmpdir(), "redhot-scripts-test-"));
after(() => rm(root, { recursive: true, force: true }));

const script = (title: string): string =>
  `#!/bin/bash\n# @redhot.title ${title}\n# @redhot.mode compact\necho hi\n`;

test("finds scripts in the folder and its subfolders, sorted by title", async () => {
  const folder = join(root, "find");
  await mkdir(join(folder, "git", "deep"), { recursive: true });
  await mkdir(join(folder, "node_modules"), { recursive: true });
  await writeFile(join(folder, "zebra.sh"), script("Zebra"));
  await writeFile(join(folder, "git", "push.sh"), script("Apple"));
  await writeFile(join(folder, "notes.txt"), "not a script");
  await writeFile(join(folder, ".hidden.sh"), script("Hidden"));
  await writeFile(join(folder, "node_modules", "dep.sh"), script("Dependency"));
  const found = listScripts(folder);
  assert.deepEqual(
    found.map(({ title, id }) => [title, id]),
    [
      ["Apple", join("git", "push.sh")],
      ["Zebra", "zebra.sh"],
    ],
  );
});

test("a missing folder has no scripts", () => {
  assert.deepEqual(listScripts(join(root, "missing")), []);
});

test("reads a script again after it changes", async () => {
  const folder = join(root, "change");
  await mkdir(folder, { recursive: true });
  const path = join(folder, "hello.sh");
  await writeFile(path, script("Before"));
  assert.equal(listScripts(folder)[0]?.title, "Before");
  await writeFile(path, script("After!"));
  const later = new Date(Date.now() + 5000);
  await utimes(path, later, later);
  assert.equal(listScripts(folder)[0]?.title, "After!");
});
