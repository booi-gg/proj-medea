import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { test } from "node:test";
import {
  createFileSearch,
  isSearchablePath,
  parseEntry,
  rankFiles,
  toSpotlightQuery,
} from "./search.ts";
import type { FileResult, FindFiles } from "./search.ts";

const HOME = "/Users/me";
const NEVER_USED = "(null)";

const toEntry = (path: string, lastUsed = NEVER_USED): string =>
  `${path}   kMDItemLastUsedDate = ${lastUsed}`;

const toFile = (path: string, lastUsed = 0): FileResult => ({
  path,
  name: path.slice(path.lastIndexOf("/") + 1),
  lastUsed,
});

test("every word has to be in the file name", () => {
  assert.equal(
    toSpotlightQuery(" tax  2024 "),
    'kMDItemFSName == "*tax*"cd && kMDItemFSName == "*2024*"cd',
  );
});

test("text starting with a dash stays inside the query, where mdfind can't read it as an option", () => {
  assert.equal(toSpotlightQuery("-foo"), 'kMDItemFSName == "*-foo*"cd');
});

test("quotes and wildcards are searched for literally", () => {
  assert.equal(toSpotlightQuery('a"b'), String.raw`kMDItemFSName == "*a\"b*"cd`);
  assert.equal(toSpotlightQuery("a*?"), String.raw`kMDItemFSName == "*a\*\?*"cd`);
  assert.equal(toSpotlightQuery(String.raw`a\b`), String.raw`kMDItemFSName == "*a\\b*"cd`);
});

test("blank text is no search at all", () => {
  assert.equal(toSpotlightQuery("   "), undefined);
});

test("reads a path and when it was last used", () => {
  assert.deepEqual(parseEntry(toEntry("/Users/me/a b.txt", "2026-11-07 15:31:15 +0000")), {
    path: "/Users/me/a b.txt",
    name: "a b.txt",
    lastUsed: Date.UTC(2026, 10, 7, 15, 31, 15),
  });
});

test("a file Spotlight has no date for counts as never used", () => {
  assert.equal(parseEntry(toEntry("/Users/me/a.txt"))?.lastUsed, 0);
});

test("an entry that isn't in the expected shape is dropped", () => {
  assert.equal(parseEntry(""), undefined);
});

test("keeps files people put in their home folder and on other drives", () => {
  assert.ok(isSearchablePath("/Users/me/Documents/report.pdf", HOME));
  assert.ok(isSearchablePath("/Users/me/report.pdf", HOME));
  assert.ok(isSearchablePath("/Volumes/Backup/report.pdf", HOME));
  assert.ok(isSearchablePath("/Applications/Safari.app", HOME));
});

test("leaves out macOS's own files and other people's home folders", () => {
  assert.equal(isSearchablePath("/System/Library/Fonts/Helvetica.ttc", HOME), false);
  assert.equal(isSearchablePath("/Users/you/report.pdf", HOME), false);
  assert.equal(isSearchablePath("/Users/mette/report.pdf", HOME), false);
});

test("leaves out dependency, Library and hidden folders", () => {
  assert.equal(isSearchablePath("/Users/me/app/node_modules/a/index.js", HOME), false);
  assert.equal(isSearchablePath("/Users/me/Library/Caches/a.txt", HOME), false);
  assert.equal(isSearchablePath("/Users/me/.cache/a.txt", HOME), false);
});

test("a hidden file in a normal folder can still be found", () => {
  assert.ok(isSearchablePath("/Users/me/app/.env", HOME));
});

test("leaves out the files inside an app", () => {
  assert.equal(isSearchablePath("/Applications/Safari.app/Contents/Info.plist", HOME), false);
});

test("iCloud Drive counts as a normal folder, even though it's inside Library", () => {
  assert.ok(
    isSearchablePath("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/report.pdf", HOME),
  );
  assert.equal(
    isSearchablePath("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/.cache/a", HOME),
    false,
  );
});

test("the exact name comes before a more recent partial match", () => {
  const ranked = rankFiles(
    [toFile("/a/report-old.pdf", 500), toFile("/a/report.pdf", 1)],
    "report",
  );
  assert.equal(ranked[0]?.path, "/a/report.pdf");
});

test("recently used files come before ones never opened", () => {
  const ranked = rankFiles([toFile("/a/my-notes.md", 0), toFile("/a/notes-2.md", 100)], "notes");
  assert.equal(ranked[0]?.path, "/a/notes-2.md");
});

test("with nothing else to go on, names that start the same and shorter paths come first", () => {
  const ranked = rankFiles(
    [toFile("/a/my-notes.md"), toFile("/a/long/way/notes-a.md"), toFile("/a/notes-b.md")],
    "notes",
  );
  assert.deepEqual(
    ranked.map(({ path }) => path),
    ["/a/notes-b.md", "/a/long/way/notes-a.md", "/a/my-notes.md"],
  );
});

test("ranking ignores case and accents", () => {
  const ranked = rankFiles([toFile("/a/older.md", 5), toFile("/a/Café.md")], "cafe");
  assert.equal(ranked[0]?.name, "Café.md");
});

const DELAY_MS = 1;
const SETTLE_MS = 20;

/** A Spotlight stand-in that answers each query with these entries. */
const fakeFind = (answers: Record<string, readonly string[]>): FindFiles => {
  const find: FindFiles = async (spotlightQuery, onEntries) => {
    onEntries(answers[spotlightQuery] ?? []);
  };
  return find;
};

const queryFor = (text: string): string => toSpotlightQuery(text) ?? "";

test("shows what Spotlight finds, and says when it has changed", async () => {
  const find = fakeFind({ [queryFor("notes")]: [toEntry("/Users/me/notes.md")] });
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  let changes = 0;
  search.setOnChange(() => {
    changes += 1;
  });
  search.setQuery("notes");
  assert.equal(search.isSearching(), true);
  await wait(SETTLE_MS);
  assert.equal(search.isSearching(), false);
  assert.deepEqual(
    search.getResults().map(({ path }) => path),
    ["/Users/me/notes.md"],
  );
  assert.ok(changes > 0);
});

test("files outside the searched places never reach the list", async () => {
  const find = fakeFind({
    [queryFor("a")]: [toEntry("/Users/me/a.md"), toEntry("/System/Library/a.md")],
  });
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("a");
  await wait(SETTLE_MS);
  assert.deepEqual(
    search.getResults().map(({ path }) => path),
    ["/Users/me/a.md"],
  );
});

test("typing more stops the previous search and ignores what it finds", async () => {
  const signals: AbortSignal[] = [];
  let sendLate: (() => void) | undefined;
  const find: FindFiles = async (spotlightQuery, onEntries, signal) => {
    signals.push(signal);
    if (spotlightQuery === queryFor("ab")) {
      onEntries([toEntry("/Users/me/abc.md")]);
      return;
    }
    await new Promise<void>((resolve) => {
      sendLate = () => {
        onEntries([toEntry("/Users/me/late-a.md")]);
        resolve();
      };
    });
  };
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("a");
  await wait(SETTLE_MS);
  search.setQuery("ab");
  await wait(SETTLE_MS);
  assert.equal(signals[0]?.aborted, true);
  sendLate?.();
  await wait(SETTLE_MS);
  assert.deepEqual(
    search.getResults().map(({ path }) => path),
    ["/Users/me/abc.md"],
  );
});

test("keystrokes in quick succession only search once", async () => {
  const seen: string[] = [];
  const find: FindFiles = async (spotlightQuery) => {
    seen.push(spotlightQuery);
  };
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("n");
  search.setQuery("no");
  search.setQuery("not");
  await wait(SETTLE_MS);
  assert.deepEqual(seen, [queryFor("not")]);
});

test("stops reading once it has plenty of files", async () => {
  let wasStopped = false;
  const find: FindFiles = async (_query, onEntries, signal) => {
    onEntries(Array.from({ length: 400 }, (_unused, index) => toEntry(`/Users/me/a${index}.md`)));
    wasStopped = signal.aborted;
  };
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("a");
  await wait(SETTLE_MS);
  assert.equal(wasStopped, true);
  assert.equal(search.getResults().length, 50);
});

test("old results are narrowed to the new text while the next search runs", async () => {
  const find = fakeFind({
    [queryFor("re")]: [toEntry("/Users/me/report.pdf"), toEntry("/Users/me/recipe.txt")],
  });
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("re");
  await wait(SETTLE_MS);
  search.setQuery("rep");
  assert.deepEqual(
    search.getResults().map(({ name }) => name),
    ["report.pdf"],
  );
  search.stop();
});

test("clearing the text clears the list", async () => {
  const find = fakeFind({ [queryFor("a")]: [toEntry("/Users/me/a.md")] });
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("a");
  await wait(SETTLE_MS);
  search.setQuery("");
  assert.deepEqual(search.getResults(), []);
  assert.equal(search.isSearching(), false);
});

test("setting the same text again doesn't restart the search", async () => {
  let searches = 0;
  const find: FindFiles = async () => {
    searches += 1;
  };
  const search = createFileSearch({ find, delayMs: DELAY_MS, home: HOME });
  search.setQuery("a");
  await wait(SETTLE_MS);
  search.setQuery(" a ");
  await wait(SETTLE_MS);
  assert.equal(searches, 1);
});
