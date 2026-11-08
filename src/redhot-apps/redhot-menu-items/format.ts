import { styleText } from "node:util";
import { matchSorter, rankings } from "match-sorter";
import { toTerminalWidth } from "../../launcher/screen.ts";
import { fitEndToWidth, toSafeName } from "../redhot-files/format.ts";
import type { MenuItem } from "./menu.ts";

const PATH_SEPARATOR = " → ";
const MIN_COLUMN_GAP = 2;
const WORD_GAPS = /\s+/u;
const UNPRINTABLE_KEY = /[\p{Cc}\p{Co}]/u;
const SPACE_KEY = " ";
const SPACE_LABEL = "Space";

// The bits of AXMenuItemCmdModifiers. Cmd is the one that's on unless a bit says otherwise.
const SHIFT_BIT = 1;
const OPTION_BIT = 2;
const CONTROL_BIT = 4;
const NO_COMMAND_BIT = 8;

const FIRST_FUNCTION_KEY_GLYPH = 111;
const FUNCTION_KEY_COUNT = 12;

const toFunctionKeyGlyphs = (): [number, string][] =>
  Array.from({ length: FUNCTION_KEY_COUNT }, (_, index) => [
    FIRST_FUNCTION_KEY_GLYPH + index,
    `F${index + 1}`,
  ]);

// Keys with no letter of their own. The numbers are Carbon's kMenu…Glyph values, which is what
// AXMenuItemCmdGlyph reports.
const GLYPHS: ReadonlyMap<number, string> = new Map([
  [2, "⇥"],
  [3, "⇤"],
  [4, "⌤"],
  [9, SPACE_LABEL],
  [10, "⌦"],
  [11, "↩"],
  [13, "↩"],
  [23, "⌫"],
  [27, "⎋"],
  [28, "⌧"],
  [98, "⇞"],
  [100, "←"],
  [101, "→"],
  [102, "↖"],
  [104, "↑"],
  [105, "↘"],
  [106, "↓"],
  [107, "⇟"],
  ...toFunctionKeyGlyphs(),
]);

const toKeyLabel = (key: string, glyph: number): string | undefined => {
  const glyphLabel = GLYPHS.get(glyph);
  if (glyphLabel !== undefined) {
    return glyphLabel;
  }
  if (key === SPACE_KEY) {
    return SPACE_LABEL;
  }
  return key === "" || UNPRINTABLE_KEY.test(key) ? undefined : key.toUpperCase();
};

/** Written the way macOS menus write it, like ⇧⌘E. Empty for an item with no shortcut. */
export const toShortcutText = ({ key, glyph, modifiers }: MenuItem): string => {
  const label = toKeyLabel(key, glyph);
  if (label === undefined) {
    return "";
  }
  const hasBit = (bit: number): boolean => (modifiers & bit) !== 0;
  const held = [
    hasBit(CONTROL_BIT) ? "⌃" : "",
    hasBit(OPTION_BIT) ? "⌥" : "",
    hasBit(SHIFT_BIT) ? "⇧" : "",
    hasBit(NO_COMMAND_BIT) ? "" : "⌘",
  ];
  return `${held.join("")}${label}`;
};

/** Titles come from another app, so nothing in them may run in the terminal. */
export const toPathText = (path: readonly string[]): string =>
  path.map(toSafeName).join(PATH_SEPARATOR);

/** The path, with the shortcut against the right edge of this many columns. */
export const toMenuRow = (item: MenuItem, width: number): string => {
  const shortcut = toShortcutText(item);
  const pathRoom = Math.max(1, width - toTerminalWidth(shortcut) - MIN_COLUMN_GAP);
  // The end of a path is the item itself, so the start is what gets cut.
  const path = fitEndToWidth(toPathText(item.path), shortcut === "" ? width : pathRoom);
  const shownPath = item.isEnabled ? path : styleText("gray", path);
  if (shortcut === "") {
    return shownPath;
  }
  const gap = Math.max(MIN_COLUMN_GAP, width - toTerminalWidth(path) - toTerminalWidth(shortcut));
  return `${shownPath}${" ".repeat(gap)}${styleText("gray", shortcut)}`;
};

/**
 * Every word has to appear somewhere in the path, so `export pdf` finds File → Export → PDF. A
 * match in the item's own title beats one in the menus above it, and the first word counts most.
 * The launcher's looser matching would spell a word out across the letters of unrelated items.
 */
export const rankMenuItems = <Option extends { name: string; aliases: readonly string[] }>(
  query: string,
  options: readonly Option[],
): Option[] =>
  query
    .trim()
    .split(WORD_GAPS)
    .filter((word) => word !== "")
    .reduceRight(
      (results, word) =>
        matchSorter(results, word, {
          keys: ["name", "aliases"],
          threshold: rankings.CONTAINS,
          baseSort: (first, second) => first.index - second.index,
        }),
      [...options],
    );
