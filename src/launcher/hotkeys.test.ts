import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LAUNCH_HOTKEY_VALUE,
  findHotkeyProblem,
  findLaunchHotkeyProblem,
  formatHotkey,
  normalizeHotkey,
  parseRecording,
  toHelperHotkeys,
  toLaunchHotkey,
  withLaunchHotkey,
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

test("names the item that holds a hotkey, using the name it's given", () => {
  const taken = { "redhot-clipboard-history:open": "shift+cmd+c" };
  assert.equal(
    findHotkeyProblem("shift+cmd+c", "redhot-settings:open", taken, () => "Clipboard History"),
    "That hotkey is already used by Clipboard History",
  );
});

test("once Redhot's hotkey is changed, the old one is free and the new one is taken", () => {
  assert.equal(
    findHotkeyProblem("cmd+shift+space", "/a.app", {}, undefined, "ctrl+cmd+r"),
    undefined,
  );
  assert.equal(
    findHotkeyProblem("cmd+ctrl+r", "/a.app", {}, undefined, "ctrl+cmd+r"),
    "That hotkey already opens Redhot",
  );
});

test("Redhot's own hotkey follows the same key rules", () => {
  assert.equal(findLaunchHotkeyProblem("nope", {}), "Use a format like cmd+shift+k");
  assert.equal(
    findLaunchHotkeyProblem("cmd+q", {}),
    "Use at least two modifiers, including cmd or ctrl",
  );
  assert.equal(findLaunchHotkeyProblem("ctrl+cmd+r", {}), undefined);
});

test("only Redhot's own hotkey can take over Spotlight's cmd+space", () => {
  const hint = "Use at least two modifiers, including cmd or ctrl";
  assert.equal(findLaunchHotkeyProblem("cmd+space", {}), undefined);
  assert.equal(findLaunchHotkeyProblem("Command + Space", {}), undefined);
  assert.equal(findLaunchHotkeyProblem("ctrl+space", {}), hint);
  assert.equal(findLaunchHotkeyProblem("option+space", {}), hint);
  assert.equal(findHotkeyProblem("cmd+space", "/a.app", {}), hint);
});

test("Redhot's own hotkey can't be left empty, because nothing would open search", () => {
  assert.equal(findLaunchHotkeyProblem("  ", {}), "Use a format like cmd+shift+k");
});

test("Redhot's own hotkey refuses one an item already uses", () => {
  assert.equal(
    findLaunchHotkeyProblem("cmd+shift+k", { "/Applications/Safari.app": "shift+cmd+k" }),
    "That hotkey is already used by Safari",
  );
});

test("a saved hotkey is normalized, and a broken one falls back to the default", () => {
  assert.equal(toLaunchHotkey("CTRL + Cmd + R"), "ctrl+cmd+r");
  assert.equal(toLaunchHotkey(undefined), "shift+cmd+space");
  assert.equal(toLaunchHotkey("banana"), "shift+cmd+space");
});

test("the helper is sent Redhot's own hotkey alongside the item ones", () => {
  assert.deepEqual(toHelperHotkeys(withLaunchHotkey({ "/a.app": "shift+cmd+k" }, "ctrl+cmd+r")), [
    { keyCode: 40, modifiers: 768, value: "/a.app" },
    { keyCode: 15, modifiers: 4352, value: LAUNCH_HOTKEY_VALUE },
  ]);
});
