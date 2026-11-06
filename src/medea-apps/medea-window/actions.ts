import type { HotkeyMap } from "../../config.ts";

export const APP_ID = "medea-window";

const THIRD = 1 / 3;
const TWO_THIRDS = 2 / 3;

export interface WindowAction {
  /** Saved aliases and hotkeys use this, so it must not change. */
  id: string;
  name: string;
  /** What the helper runs. Placements are x, y, width and height, as parts of the display. */
  command: string;
  defaultHotkey: string;
}

const toPlacement = (x: number, y: number, width: number, height: number): string =>
  `place ${x} ${y} ${width} ${height}`;

// The default keys follow Rectangle's, so they're familiar to anyone switching from it.
export const WINDOW_ACTIONS: readonly WindowAction[] = [
  {
    id: "left-half",
    name: "Left Half",
    command: toPlacement(0, 0, 0.5, 1),
    defaultHotkey: "ctrl+option+left",
  },
  {
    id: "right-half",
    name: "Right Half",
    command: toPlacement(0.5, 0, 0.5, 1),
    defaultHotkey: "ctrl+option+right",
  },
  {
    id: "top-half",
    name: "Top Half",
    command: toPlacement(0, 0, 1, 0.5),
    defaultHotkey: "ctrl+option+up",
  },
  {
    id: "bottom-half",
    name: "Bottom Half",
    command: toPlacement(0, 0.5, 1, 0.5),
    defaultHotkey: "ctrl+option+down",
  },
  {
    id: "top-left",
    name: "Top Left Quarter",
    command: toPlacement(0, 0, 0.5, 0.5),
    defaultHotkey: "ctrl+option+u",
  },
  {
    id: "top-right",
    name: "Top Right Quarter",
    command: toPlacement(0.5, 0, 0.5, 0.5),
    defaultHotkey: "ctrl+option+i",
  },
  {
    id: "bottom-left",
    name: "Bottom Left Quarter",
    command: toPlacement(0, 0.5, 0.5, 0.5),
    defaultHotkey: "ctrl+option+j",
  },
  {
    id: "bottom-right",
    name: "Bottom Right Quarter",
    command: toPlacement(0.5, 0.5, 0.5, 0.5),
    defaultHotkey: "ctrl+option+k",
  },
  {
    id: "left-third",
    name: "Left Third",
    command: toPlacement(0, 0, THIRD, 1),
    defaultHotkey: "ctrl+option+d",
  },
  {
    id: "center-third",
    name: "Center Third",
    command: toPlacement(THIRD, 0, THIRD, 1),
    defaultHotkey: "ctrl+option+f",
  },
  {
    id: "right-third",
    name: "Right Third",
    command: toPlacement(TWO_THIRDS, 0, THIRD, 1),
    defaultHotkey: "ctrl+option+g",
  },
  {
    id: "left-two-thirds",
    name: "Left Two Thirds",
    command: toPlacement(0, 0, TWO_THIRDS, 1),
    defaultHotkey: "ctrl+option+e",
  },
  {
    id: "right-two-thirds",
    name: "Right Two Thirds",
    command: toPlacement(THIRD, 0, TWO_THIRDS, 1),
    defaultHotkey: "ctrl+option+t",
  },
  {
    id: "maximize",
    name: "Maximize",
    command: toPlacement(0, 0, 1, 1),
    defaultHotkey: "ctrl+option+return",
  },
  { id: "center", name: "Center", command: "center", defaultHotkey: "ctrl+option+c" },
  {
    id: "restore",
    name: "Restore Window",
    command: "restore",
    defaultHotkey: "ctrl+option+delete",
  },
  {
    id: "next-display",
    name: "Next Display",
    command: "display next",
    defaultHotkey: "ctrl+option+cmd+right",
  },
  {
    id: "previous-display",
    name: "Previous Display",
    command: "display previous",
    defaultHotkey: "ctrl+option+cmd+left",
  },
];

export const toWindowValue = (id: string): string => `${APP_ID}:${id}`;

/** The helper command for an item, or undefined when it isn't a window action. */
export const findWindowCommand = (itemValue: string): string | undefined =>
  WINDOW_ACTIONS.find(({ id }) => toWindowValue(id) === itemValue)?.command;

export interface DefaultHotkeys {
  hotkeys: HotkeyMap;
  added: number;
}

/** Fills in what's free, so a hotkey you've already chosen always stays. */
export const addDefaultHotkeys = (saved: HotkeyMap): DefaultHotkeys => {
  const hotkeys = { ...saved };
  const inUse = new Set(Object.values(saved));
  let added = 0;
  for (const { id, defaultHotkey } of WINDOW_ACTIONS) {
    const value = toWindowValue(id);
    if (hotkeys[value] === undefined && !inUse.has(defaultHotkey)) {
      hotkeys[value] = defaultHotkey;
      inUse.add(defaultHotkey);
      added += 1;
    }
  }
  return { hotkeys, added };
};
