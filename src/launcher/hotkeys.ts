import { DEFAULT_LAUNCH_HOTKEY, readConfig, updateConfig } from "../config.ts";
import type { HotkeyMap } from "../config.ts";
import { findWindowCommand } from "../redhot-apps/redhot-window/actions.ts";
import { toDisplayName } from "./aliases.ts";

/** The helper sees the shortcut that opens Redhot as an item with this value. */
export const LAUNCH_HOTKEY_VALUE = "redhot:open";
export const LAUNCH_HOTKEY_NAME = "Redhot";
const MIN_MODIFIERS = 2;
// Spotlight's shortcut. A launcher replacing Spotlight is the one case for a single modifier.
const SPOTLIGHT_HOTKEY = "cmd+space";
const FORMAT_HINT = "Use a format like cmd+shift+k";
const MODIFIER_HINT = "Use at least two modifiers, including cmd or ctrl";

// In display order. The values are Carbon's modifier flags.
const MODIFIERS = {
  ctrl: { flag: 4096, symbol: "⌃" },
  option: { flag: 2048, symbol: "⌥" },
  shift: { flag: 512, symbol: "⇧" },
  cmd: { flag: 256, symbol: "⌘" },
} as const;

type Modifier = keyof typeof MODIFIERS;

const MODIFIER_ORDER: Modifier[] = ["ctrl", "option", "shift", "cmd"];

const MODIFIER_NAMES: Record<string, Modifier> = {
  ctrl: "ctrl",
  control: "ctrl",
  option: "option",
  opt: "option",
  alt: "option",
  shift: "shift",
  cmd: "cmd",
  command: "cmd",
};

// Carbon's virtual key codes, from HIToolbox/Events.h.
const KEY_CODES: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  h: 4,
  g: 5,
  z: 6,
  x: 7,
  c: 8,
  v: 9,
  b: 11,
  q: 12,
  w: 13,
  e: 14,
  r: 15,
  y: 16,
  t: 17,
  o: 31,
  u: 32,
  i: 34,
  p: 35,
  l: 37,
  j: 38,
  k: 40,
  n: 45,
  m: 46,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "5": 23,
  "6": 22,
  "7": 26,
  "8": 28,
  "9": 25,
  "0": 29,
  "-": 27,
  "=": 24,
  "[": 33,
  "]": 30,
  ";": 41,
  "'": 39,
  "\\": 42,
  ",": 43,
  ".": 47,
  "/": 44,
  "`": 50,
  space: 49,
  return: 36,
  tab: 48,
  delete: 51,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

const KEY_SYMBOLS: Record<string, string> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  return: "↩",
  delete: "⌫",
  tab: "⇥",
};

interface ParsedHotkey {
  modifiers: Modifier[];
  key: string;
}

const parseHotkey = (input: string): ParsedHotkey | undefined => {
  const parts = input
    .toLowerCase()
    .split("+")
    .map((part) => part.trim());
  const key = parts.at(-1) ?? "";
  if (!Object.hasOwn(KEY_CODES, key)) {
    return undefined;
  }
  const modifierParts = parts.slice(0, -1);
  if (!modifierParts.every((part) => Object.hasOwn(MODIFIER_NAMES, part))) {
    return undefined;
  }
  const chosen = new Set(modifierParts.map((part) => MODIFIER_NAMES[part]));
  return {
    modifiers: MODIFIER_ORDER.filter((modifier) => chosen.has(modifier)),
    key,
  };
};

const toCanonical = ({ modifiers, key }: ParsedHotkey): string => [...modifiers, key].join("+");

/** "Shift + CMD + K" becomes "shift+cmd+k", or undefined when it isn't a hotkey. */
export const normalizeHotkey = (input: string): string | undefined => {
  const parsed = parseHotkey(input);
  return parsed === undefined ? undefined : toCanonical(parsed);
};

/** "shift+cmd+k" becomes "⇧⌘K". */
export const formatHotkey = (hotkey: string): string => {
  const parsed = parseHotkey(hotkey);
  if (parsed === undefined) {
    return "";
  }
  const symbols = parsed.modifiers.map((modifier) => MODIFIERS[modifier].symbol).join("");
  const key =
    KEY_SYMBOLS[parsed.key] ?? (parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return `${symbols}${key}`;
};

/** Returns what is wrong with the keys themselves, or undefined when only clashes are left. */
const findShapeProblem = (parsed: ParsedHotkey | undefined): string | undefined => {
  if (parsed === undefined) {
    return FORMAT_HINT;
  }
  const hasCmdOrCtrl = parsed.modifiers.includes("cmd") || parsed.modifiers.includes("ctrl");
  return parsed.modifiers.length < MIN_MODIFIERS || !hasCmdOrCtrl ? MODIFIER_HINT : undefined;
};

/** Names the item already holding this hotkey, ignoring the one being changed. */
const findClash = (
  hotkey: string,
  itemValue: string,
  allHotkeys: HotkeyMap,
  toName: (itemValue: string) => string,
): string | undefined => {
  for (const [otherValue, otherHotkey] of Object.entries(allHotkeys)) {
    if (otherValue !== itemValue && otherHotkey === hotkey) {
      return `That hotkey is already used by ${toName(otherValue)}`;
    }
  }
  return undefined;
};

/** Returns what is wrong with this hotkey, or undefined when it can be saved. */
export const findHotkeyProblem = (
  input: string,
  itemValue: string,
  allHotkeys: HotkeyMap,
  toName: (itemValue: string) => string = toDisplayName,
  launchHotkey: string = DEFAULT_LAUNCH_HOTKEY,
): string | undefined => {
  if (input.trim() === "") {
    return undefined;
  }
  const parsed = parseHotkey(input);
  const shapeProblem = findShapeProblem(parsed);
  if (parsed === undefined || shapeProblem !== undefined) {
    return shapeProblem;
  }
  const hotkey = toCanonical(parsed);
  if (hotkey === normalizeHotkey(launchHotkey)) {
    return "That hotkey already opens Redhot";
  }
  return findClash(hotkey, itemValue, allHotkeys, toName);
};

/**
 * The same rules for the shortcut that opens Redhot, except that it may take over Spotlight's. It
 * can't be empty because there would then be no way to open search from another app.
 */
export const findLaunchHotkeyProblem = (
  input: string,
  allHotkeys: HotkeyMap,
  toName: (itemValue: string) => string = toDisplayName,
): string | undefined => {
  const parsed = parseHotkey(input);
  const isSpotlightHotkey = parsed !== undefined && toCanonical(parsed) === SPOTLIGHT_HOTKEY;
  const shapeProblem = isSpotlightHotkey ? undefined : findShapeProblem(parsed);
  if (parsed === undefined || shapeProblem !== undefined) {
    return shapeProblem;
  }
  return findClash(toCanonical(parsed), LAUNCH_HOTKEY_VALUE, allHotkeys, toName);
};

const isModifierName = (value: unknown): value is Modifier =>
  typeof value === "string" && Object.hasOwn(MODIFIERS, value);

export type Recording =
  | { kind: "keys"; hotkey: string; usedBySystem: boolean }
  | { kind: "interrupted" };

/** Reads the recorder's JSON. Returns undefined when it isn't a key Redhot can register. */
export const parseRecording = (recording: string): Recording | undefined => {
  try {
    const parsed: unknown = JSON.parse(recording);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    if ("interrupted" in parsed) {
      return { kind: "interrupted" };
    }
    if (!("keyCode" in parsed) || !("modifiers" in parsed)) {
      return undefined;
    }
    const { keyCode, modifiers } = parsed;
    const key = Object.keys(KEY_CODES).find((name) => KEY_CODES[name] === keyCode);
    if (key === undefined || !Array.isArray(modifiers) || !modifiers.every(isModifierName)) {
      return undefined;
    }
    const hotkey = normalizeHotkey([...modifiers, key].join("+"));
    const usedBySystem = "usedBySystem" in parsed && parsed.usedBySystem === true;
    return hotkey === undefined ? undefined : { kind: "keys", hotkey, usedBySystem };
  } catch {
    return undefined;
  }
};

/** Falls back to the default, so a hand-edited settings file can't leave Redhot unreachable. */
export const toLaunchHotkey = (saved: string | undefined): string =>
  (saved === undefined ? undefined : normalizeHotkey(saved)) ?? DEFAULT_LAUNCH_HOTKEY;

export const saveLaunchHotkey = async (input: string): Promise<void> => {
  const launchHotkey = normalizeHotkey(input);
  if (launchHotkey === undefined) {
    throw new Error(FORMAT_HINT);
  }
  await updateConfig({ launchHotkey });
};

export const saveHotkey = async (itemValue: string, input: string): Promise<void> => {
  const { hotkeys } = await readConfig();
  const { [itemValue]: _previous, ...others } = hotkeys;
  const hotkey = normalizeHotkey(input);
  await updateConfig({
    hotkeys: hotkey === undefined ? others : { ...others, [itemValue]: hotkey },
  });
};

export interface HelperHotkey {
  keyCode: number;
  modifiers: number;
  value: string;
  windowCommand?: string;
}

/** The item hotkeys plus the one that opens Redhot, which the helper registers the same way. */
export const withLaunchHotkey = (
  hotkeys: HotkeyMap,
  launchHotkey: string | undefined,
): HotkeyMap => ({
  ...hotkeys,
  [LAUNCH_HOTKEY_VALUE]: toLaunchHotkey(launchHotkey),
});

/** Converts saved hotkeys into the numbers the Swift helper registers. */
export const toHelperHotkeys = (hotkeys: HotkeyMap): HelperHotkey[] => {
  const helperHotkeys: HelperHotkey[] = [];
  for (const [value, hotkey] of Object.entries(hotkeys)) {
    const parsed = parseHotkey(hotkey);
    if (parsed !== undefined) {
      const flags = parsed.modifiers.map((modifier) => MODIFIERS[modifier].flag);
      const modifiers = flags.reduce((all, flag) => all + flag, 0);
      const windowCommand = findWindowCommand(value);
      helperHotkeys.push({
        keyCode: KEY_CODES[parsed.key] ?? 0,
        modifiers,
        value,
        ...(windowCommand === undefined ? {} : { windowCommand }),
      });
    }
  }
  return helperHotkeys;
};
