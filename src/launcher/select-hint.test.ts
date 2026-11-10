import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import { isCancel, select } from "@clack/prompts";
import "./select-hint.ts";

const CTRL_C = "\u0003";

test("select menus say that Esc cancels", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let rendered = "";
  output.on("data", (chunk: Buffer) => {
    rendered += chunk.toString();
  });

  const answer = select({
    message: "Pick one",
    options: [{ value: "only", label: "Only" }],
    input,
    output,
  });
  await nextTurn();
  input.write(CTRL_C);

  assert.ok(isCancel(await answer));
  assert.match(
    stripVTControlCharacters(rendered),
    /↑\/↓ to navigate • Enter: confirm • Esc: cancel/u,
  );
});
