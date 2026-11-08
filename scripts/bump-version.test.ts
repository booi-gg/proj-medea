import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bumpVersion,
  releaseChangelog,
  setPackageVersion,
  toBumpLevel,
  toCommitLevel,
} from "./bump-version.ts";

const commit = (subject: string, body = "") => ({ subject, body });

test("reads the level each commit asks for", () => {
  assert.equal(toCommitLevel(commit("feat(native): draw the logo")), "minor");
  assert.equal(toCommitLevel(commit("fix(terminals): quote the path")), "patch");
  assert.equal(toCommitLevel(commit("update: new logo")), "patch");
  assert.equal(toCommitLevel(commit("Rename the banner")), "patch");
  assert.equal(toCommitLevel(commit("feat!: drop Ghostty")), "major");
  assert.equal(
    toCommitLevel(commit("refactor(config): drop terminal", "BREAKING CHANGE: gone")),
    "major",
  );
});

test("docs, tests, CI and chores alone release nothing", () => {
  for (const subject of [
    "docs: readme",
    "test(banner): rows",
    "ci: release",
    "chore: tidy",
    "style: fmt",
  ]) {
    assert.equal(toCommitLevel(commit(subject)), undefined);
  }
  assert.equal(toBumpLevel([commit("docs: readme"), commit("chore: tidy")]), undefined);
  assert.equal(toBumpLevel([]), undefined);
});

test("the biggest level wins", () => {
  assert.equal(toBumpLevel([commit("fix: a"), commit("feat: b"), commit("docs: c")]), "minor");
  assert.equal(toBumpLevel([commit("feat: a"), commit("fix!: b")]), "major");
});

test("bumps each part and resets the smaller ones", () => {
  assert.equal(bumpVersion("0.1.3", "patch"), "0.1.4");
  assert.equal(bumpVersion("0.1.3", "minor"), "0.2.0");
  assert.equal(bumpVersion("0.1.3", "major"), "1.0.0");
  assert.equal(bumpVersion("0.1.9", "patch"), "0.1.10");
  assert.throws(() => bumpVersion("next", "patch"));
});

test("names the Unreleased changes after the new version", () => {
  const changelog = "# Changelog\n\n## Unreleased\n\n- New thing.\n\n## 0.1.3\n";
  assert.equal(
    releaseChangelog(changelog, "0.1.4"),
    "# Changelog\n\n## Unreleased\n\n## 0.1.4\n\n- New thing.\n\n## 0.1.3\n",
  );
});

test("changes only the version in package.json", () => {
  const text =
    '{\n  "name": "@booi-gg/redhot",\n  "version": "0.1.3",\n  "engines": { "node": ">=22.1" }\n}\n';
  assert.equal(setPackageVersion(text, "0.1.4"), text.replace("0.1.3", "0.1.4"));
});
