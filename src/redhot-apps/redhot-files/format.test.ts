import assert from "node:assert/strict";
import { stripVTControlCharacters, styleText } from "node:util";
import { test } from "node:test";
import stringWidth from "string-width";
import { toFileRow, toFolderLabel, toSafeName } from "./format.ts";

const HOME = "/Users/me";

const toRow = (path: string, width: number): string =>
  toFileRow({ path, name: path.slice(path.lastIndexOf("/") + 1), lastUsed: 0 }, width, HOME);

test("a home folder is written with a tilde", () => {
  assert.equal(toFolderLabel("/Users/me/Documents/a.pdf", HOME), "~/Documents");
  assert.equal(toFolderLabel("/Users/me/a.pdf", HOME), "~");
});

test("a folder that only starts like the home folder keeps its full path", () => {
  assert.equal(toFolderLabel("/Users/mette/a.pdf", HOME), "/Users/mette");
});

test("iCloud Drive goes by the name Finder shows", () => {
  const iCloud = "/Users/me/Library/Mobile Documents/com~apple~CloudDocs";
  assert.equal(toFolderLabel(`${iCloud}/a.pdf`, HOME), "iCloud Drive");
  assert.equal(toFolderLabel(`${iCloud}/Tax/a.pdf`, HOME), "iCloud Drive/Tax");
});

test("the folder sits beside the name, dimmed", () => {
  assert.equal(
    toRow("/Users/me/Documents/a.pdf", 40),
    `a.pdf  ${styleText("gray", "~/Documents")}`,
  );
});

test("a long folder loses its start, because its end says where the file is", () => {
  const row = stripVTControlCharacters(toRow("/Users/me/one/two/three/four/five/a.pdf", 20));
  assert.equal(row, "a.pdf  …ee/four/five");
});

test("a row never takes more than its width", () => {
  const longName = `${"name".repeat(30)}.pdf`;
  for (const width of [12, 30, 72]) {
    const row = stripVTControlCharacters(toRow(`/Users/me/a/deep/folder/${longName}`, width));
    assert.ok(stringWidth(row) <= width, `${stringWidth(row)} > ${width}`);
  }
});

test("wide characters count as two columns", () => {
  const row = stripVTControlCharacters(toRow(`/Users/me/${"日本".repeat(20)}/a.pdf`, 24));
  assert.ok(stringWidth(row) <= 24);
});

test("escape codes in a file name can't reach the terminal", () => {
  assert.equal(toSafeName("a\u001B]0;evil\u0007.txt"), "a]0;evil.txt");
});
