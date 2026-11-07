import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeHotkey, toHelperHotkeys } from "../../launcher/hotkeys.ts";
import { WINDOW_ACTIONS, addDefaultHotkeys, findWindowCommand, toWindowValue } from "./actions.ts";

const PLACEMENT = /^place (\S+) (\S+) (\S+) (\S+)$/;
const ROUNDING_ALLOWANCE = 1e-9;

test("action IDs and default hotkeys are unique", () => {
  assert.equal(new Set(WINDOW_ACTIONS.map(({ id }) => id)).size, WINDOW_ACTIONS.length);
  const hotkeys = WINDOW_ACTIONS.map(({ defaultHotkey }) => defaultHotkey);
  assert.equal(new Set(hotkeys).size, hotkeys.length);
});

test("every diagram is three columns, so rows line up", () => {
  for (const { id, diagram } of WINDOW_ACTIONS) {
    assert.equal(diagram.length, 3, id);
  }
});

test("hints stay short enough for an 80-column window", () => {
  for (const { id, hint } of WINDOW_ACTIONS) {
    assert.ok((hint ?? "").length <= 36, id);
  }
});

test("default hotkeys are already in the saved form", () => {
  for (const { defaultHotkey } of WINDOW_ACTIONS) {
    assert.equal(normalizeHotkey(defaultHotkey), defaultHotkey);
  }
});

test("every placement stays inside the display", () => {
  for (const { id, command } of WINDOW_ACTIONS) {
    const match = PLACEMENT.exec(command);
    if (match !== null) {
      const [x, y, width, height] = match.slice(1).map(Number);
      assert.ok(x !== undefined && y !== undefined && width !== undefined && height !== undefined);
      assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0, id);
      assert.ok(x + width <= 1 + ROUNDING_ALLOWANCE, id);
      assert.ok(y + height <= 1 + ROUNDING_ALLOWANCE, id);
    }
  }
});

test("finds the command for a window item and nothing else", () => {
  assert.equal(findWindowCommand(toWindowValue("center")), "center");
  assert.equal(findWindowCommand("/Applications/Safari.app"), undefined);
  assert.equal(findWindowCommand("redhot-window:add-default-hotkeys"), undefined);
});

test("hands the helper a window action's command, so a press skips Node", () => {
  assert.deepEqual(toHelperHotkeys({ [toWindowValue("left-half")]: "ctrl+option+left" }), [
    {
      keyCode: 123,
      modifiers: 6144,
      value: "redhot-window:left-half",
      windowCommand: "place 0 0 0.5 1",
    },
  ]);
});

test("delete can be a hotkey", () => {
  assert.deepEqual(toHelperHotkeys({ [toWindowValue("restore")]: "ctrl+option+delete" }), [
    {
      keyCode: 51,
      modifiers: 6144,
      value: "redhot-window:restore",
      windowCommand: "restore",
    },
  ]);
});

test("adds every default to empty settings", () => {
  const { hotkeys, added } = addDefaultHotkeys({});
  assert.equal(added, WINDOW_ACTIONS.length);
  assert.equal(hotkeys["redhot-window:left-half"], "ctrl+option+left");
});

test("keeps a window hotkey you already chose", () => {
  const { hotkeys, added } = addDefaultHotkeys({
    "redhot-window:left-half": "ctrl+cmd+h",
  });
  assert.equal(hotkeys["redhot-window:left-half"], "ctrl+cmd+h");
  assert.equal(added, WINDOW_ACTIONS.length - 1);
});

test("skips a default that another item already uses", () => {
  const { hotkeys, added } = addDefaultHotkeys({ "/a.app": "ctrl+option+c" });
  assert.equal(hotkeys["/a.app"], "ctrl+option+c");
  assert.equal(hotkeys["redhot-window:center"], undefined);
  assert.equal(added, WINDOW_ACTIONS.length - 1);
});

test("running it twice adds nothing new", () => {
  const { hotkeys } = addDefaultHotkeys({});
  assert.equal(addDefaultHotkeys(hotkeys).added, 0);
});
