import assert from "node:assert/strict";
import { test } from "node:test";
import { createHighlighter } from "./syntax.ts";

// Tests have no terminal, so colours must be asked for before the library loads.
process.env.FORCE_COLOR = "3";
const highlight = await createHighlighter();
const isColored = (text: string): boolean => highlight(text).includes("\u001B[");

const code = {
  typescript: "export const add = (a: number, b: number): number => {\n  return a + b;\n};",
  python: 'def greet(name):\n    print(f"hello {name}")\n    return True\n',
  swift: "guard let text = pasteboard.string(forType: .string) else {\n  return\n}",
  json: '{\n  "name": "medea",\n  "version": "0.1.0",\n  "private": true\n}',
  bash: 'for f in *.png; do\n  sips -Z 96 "$f" --out "thumb-$f"\ndone',
  html: '<div class="row">\n  <a href="/x">link</a>\n</div>',
  css: ".row {\n  display: flex;\n  color: #fff;\n}",
  sql: "SELECT id, name\nFROM users\nWHERE age > 21\n  AND name IS NOT NULL\nORDER BY name;",
  "a short test":
    'test("leaves text that fits exactly", () => {\n  assert.equal(toPreview("abcde", 5), "abcde");\n});\n',
  "one-line SQL": "DELETE FROM sessions WHERE expired = true;",
  "one line of JavaScript": "const value = await fetch(url);",
  "a function call": "console.log(items.map((item) => item.name));",
};

const notCode = {
  sentence: "Recording needs the menu bar helper. It does not start at login yet.",
  url: "https://en.wikipedia.org/wiki/Clipboard",
  email: "hello@example.com",
  message: "Hey, can you send me the notes?\nI need them before tomorrow.\nThanks!",
  list: "- milk\n- eggs\n- bread",
  table: "| Quicklinks | Yes, built | Nothing special |",
  card: "4111 1111 1111 1111",
  path: "/Users/Core/Booi/dev/personal/proj-supercast",
  log: "INFO 2026-11-06 server started on port 3000\nWARN slow request took 2301ms",
  "sentence with SQL words": "We need to update the table where the users are listed.",
  "sentence with brackets": "Send the report (the long one) to the team by Friday.",
  "menu text": " ● Start at login  ○ Off (Puts Medea in the menu bar when you log in)",
  "markdown table": "| Quicklinks | Yes, built | Nothing special |\n| Aliases | Yes | None |",
};

for (const [language, sample] of Object.entries(code)) {
  test(`colours ${language}`, () => {
    assert.ok(isColored(sample));
  });
}

for (const [kind, sample] of Object.entries(notCode)) {
  test(`leaves a ${kind} plain`, () => {
    assert.equal(highlight(sample), sample);
  });
}

test("keeps the same lines, so a preview can't shift", () => {
  const sample = "/* first\n   second */\nexport const add = (a: number) => {\n  return a;\n};";
  assert.equal(highlight(sample).split("\n").length, 5);
});

test("closes colours on each line, so cutting one can't colour the next", () => {
  const sample = "/* first\n   second */\nexport const add = (a: number) => {\n  return a;\n};";
  const [firstLine] = highlight(sample).split("\n");
  assert.ok(firstLine?.endsWith("\u001B[39m"));
});

test("leaves very long text alone", () => {
  const sample = "const a = 1;\n".repeat(5000);
  assert.equal(highlight(sample), sample);
});
