import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findHotkeyProblem,
  formatHotkey,
  normalizeHotkey,
  parseRecording,
  toHelperHotkeys,
} from "./hotkeys.ts";

test("normalizes order, case, spaces and modifier names", () => {
  assert.equal(normalizeHotkey("CMD + Shift + K"), "shift+cmd+k");
  assert.equal(normalizeHotkey("command+control+1"), "ctrl+cmd+1");
  assert.equal(normalizeHotkey("alt+cmd+f5"), "option+cmd+f5");
});

test("rejects things that are not hotkeys", () => {
  for (const input of ["cmd+", "cmd+shift", "cmd+shift+kk", "banana+k", "toString", ""]) {
    assert.equal(normalizeHotkey(input), undefined, input);
  }
});

test("shows symbols", () => {
  assert.equal(formatHotkey("shift+cmd+k"), "⇧⌘K");
  assert.equal(formatHotkey("ctrl+option+shift+cmd+space"), "⌃⌥⇧⌘space");
  assert.equal(formatHotkey("ctrl+option+left"), "⌃⌥←");
  assert.equal(formatHotkey("ctrl+option+delete"), "⌃⌥⌫");
});

test("an empty hotkey is allowed, because it removes the hotkey", () => {
  assert.equal(findHotkeyProblem("  ", "/a.app", {}), undefined);
});

test("explains the format", () => {
  assert.equal(findHotkeyProblem("nope", "/a.app", {}), "Use a format like cmd+shift+k");
});

test("needs two modifiers including cmd or ctrl", () => {
  const hint = "Use at least two modifiers, including cmd or ctrl";
  assert.equal(findHotkeyProblem("cmd+q", "/a.app", {}), hint);
  assert.equal(findHotkeyProblem("k", "/a.app", {}), hint);
  assert.equal(findHotkeyProblem("option+shift+k", "/a.app", {}), hint);
  assert.equal(findHotkeyProblem("ctrl+option+k", "/a.app", {}), undefined);
});

test("refuses Redhot's own hotkey", () => {
  assert.equal(
    findHotkeyProblem("cmd+shift+space", "/a.app", {}),
    "That hotkey already opens Redhot",
  );
});

test("refuses a hotkey another app uses, in any order", () => {
  const hotkeys = { "/Applications/Safari.app": "shift+cmd+k" };
  assert.equal(
    findHotkeyProblem("cmd+shift+k", "/a.app", hotkeys),
    "That hotkey is already used by Safari",
  );
});

test("an app can keep its own hotkey", () => {
  assert.equal(findHotkeyProblem("shift+cmd+k", "/a.app", { "/a.app": "shift+cmd+k" }), undefined);
});

test("converts to Carbon key codes and flags", () => {
  assert.deepEqual(toHelperHotkeys({ "/a.app": "shift+cmd+k" }), [
    { keyCode: 40, modifiers: 768, value: "/a.app" },
  ]);
});

test("reads a recording", () => {
  assert.deepEqual(parseRecording('{"keyCode":40,"modifiers":["cmd","shift"]}'), {
    kind: "keys",
    hotkey: "shift+cmd+k",
    usedBySystem: false,
  });
});

test("reads a punctuation key", () => {
  const recording = parseRecording('{"keyCode":44,"modifiers":["ctrl","cmd"]}');
  assert.equal(recording?.kind === "keys" && recording.hotkey, "ctrl+cmd+/");
  assert.equal(formatHotkey("ctrl+cmd+/"), "⌃⌘/");
});

test("reads a macOS shortcut warning", () => {
  const recording = parseRecording(
    '{"keyCode":20,"modifiers":["shift","cmd"],"usedBySystem":true}',
  );
  assert.equal(recording?.kind === "keys" && recording.usedBySystem, true);
});

test("reads an interrupted recording", () => {
  assert.deepEqual(parseRecording('{"interrupted":true}'), {
    kind: "interrupted",
  });
});

test("rejects a recording of an unknown key or bad data", () => {
  for (const recording of [
    '{"keyCode":999,"modifiers":["cmd"]}',
    "nope",
    "null",
    '{"keyCode":40}',
  ]) {
    assert.equal(parseRecording(recording), undefined, recording);
  }
});

test("a command can have a hotkey", () => {
  assert.equal(findHotkeyProblem("shift+cmd+e", "command:exit", {}), undefined);
  assert.deepEqual(toHelperHotkeys({ "command:exit": "shift+cmd+e" }), [
    { keyCode: 14, modifiers: 768, value: "command:exit" },
  ]);
});

test("names a command that already uses a hotkey", () => {
  assert.equal(
    findHotkeyProblem("shift+cmd+e", "/a.app", {
      "command:exit": "shift+cmd+e",
    }),
    "That hotkey is already used by exit",
  );
});

test("skips hotkeys that can't be read", () => {
  assert.deepEqual(toHelperHotkeys({ "/a.app": "nonsense" }), []);
});
