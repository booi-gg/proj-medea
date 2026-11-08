import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type BumpLevel = "major" | "minor" | "patch";

export interface Commit {
  subject: string;
  body: string;
}

// The subject a release commit starts with. A push of only release commits releases nothing.
export const RELEASE_SUBJECT = "chore(release): bump version";
const RELEASE_BRANCH = "main";
const SUBJECT_PATTERN = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:/iu;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/mu;
// Changes that don't touch what npm ships. A push of only these releases nothing.
const NO_RELEASE_TYPES = new Set(["chore", "ci", "docs", "style", "test"]);
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/u;
const LEVEL_ORDER: readonly BumpLevel[] = ["patch", "minor", "major"];

/** The level one commit asks for, or undefined when it doesn't need a release. */
export const toCommitLevel = ({ subject, body }: Commit): BumpLevel | undefined => {
  const match = SUBJECT_PATTERN.exec(subject);
  const type = match?.groups?.type?.toLowerCase();
  if (match?.groups?.breaking === "!" || BREAKING_FOOTER.test(body)) {
    return "major";
  }
  if (type === "feat") {
    return "minor";
  }
  // Commits without a known prefix, like "update: ...", still change the package.
  return type !== undefined && NO_RELEASE_TYPES.has(type) ? undefined : "patch";
};

/** The biggest level any commit asks for, or undefined when none needs a release. */
export const toBumpLevel = (commits: readonly Commit[]): BumpLevel | undefined => {
  let level: BumpLevel | undefined;
  for (const commit of commits) {
    const commitLevel = toCommitLevel(commit);
    if (
      commitLevel !== undefined &&
      (level === undefined || LEVEL_ORDER.indexOf(commitLevel) > LEVEL_ORDER.indexOf(level))
    ) {
      level = commitLevel;
    }
  }
  return level;
};

export const bumpVersion = (version: string, level: BumpLevel): string => {
  const match = VERSION_PATTERN.exec(version);
  if (match === null) {
    throw new Error(`Can't bump "${version}": it isn't a version like 1.2.3.`);
  }
  const [major, minor, patch] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

/** Renames the Unreleased section to the new version and starts an empty one above it. */
export const releaseChangelog = (changelog: string, version: string): string =>
  changelog.replace(/^## Unreleased$/mu, `## Unreleased\n\n## ${version}`);

/** Changes only the version line, so the rest of package.json keeps its formatting. */
export const setPackageVersion = (packageText: string, version: string): string =>
  packageText.replace(/^(\s*"version":\s*")[^"]+(")/mu, `$1${version}$2`);

const RECORD_END = "\u001E";
const FIELD_END = "\u001F";

const git = (args: readonly string[]): string =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

/** Commits since the last release commit, or the whole history when there is none. */
const readUnreleasedCommits = (): Commit[] => {
  const lastRelease = git([
    "log",
    "--format=%H",
    "--fixed-strings",
    `--grep=${RELEASE_SUBJECT}`,
    "-1",
  ]);
  const range = lastRelease === "" ? ["HEAD"] : [`${lastRelease}..HEAD`];
  return git(["log", `--format=%s${FIELD_END}%b${RECORD_END}`, ...range])
    .split(RECORD_END)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [subject = "", body = ""] = record.split(FIELD_END);
      return { subject, body };
    })
    .filter(({ subject }) => !subject.startsWith(RELEASE_SUBJECT));
};

/** A release commits every changed file, so it only runs from a clean main. */
const assertReadyToRelease = (): void => {
  const branch = git(["branch", "--show-current"]);
  if (branch !== RELEASE_BRANCH) {
    throw new Error(`Releases run from ${RELEASE_BRANCH}, but this is "${branch}".`);
  }
  if (git(["status", "--porcelain"]) !== "") {
    throw new Error("Commit or stash your changes before releasing.");
  }
};

const main = (): void => {
  assertReadyToRelease();
  const root = git(["rev-parse", "--show-toplevel"]);
  const level = toBumpLevel(readUnreleasedCommits());
  if (level === undefined) {
    process.stdout.write("Nothing to release.\n");
    return;
  }
  const packagePath = join(root, "package.json");
  const packageText = readFileSync(packagePath, "utf8");
  const { version: current } = JSON.parse(packageText);
  const next = bumpVersion(current, level);
  writeFileSync(packagePath, setPackageVersion(packageText, next));
  const changelogPath = join(root, "CHANGELOG.md");
  writeFileSync(changelogPath, releaseChangelog(readFileSync(changelogPath, "utf8"), next));
  git(["commit", "--all", "--message", `${RELEASE_SUBJECT} ${current} -> ${next}`]);
  // Annotated, because git push --follow-tags skips lightweight tags.
  git(["tag", "--annotate", `v${next}`, "--message", `v${next}`]);
  git(["push", "--follow-tags"]);
  // Inherits the terminal, so npm can ask for a login or one-time password.
  execFileSync("npm", ["publish"], { stdio: "inherit" });
  process.stdout.write(`Released ${next}.\n`);
};

if (import.meta.main) {
  main();
}
