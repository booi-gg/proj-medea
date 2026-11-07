import { styleText } from "node:util";
import { readConfig } from "../config.ts";
import type { AliasMap, HotkeyMap } from "../config.ts";
import { toRedhotIcon } from "../redhot-apps/icon.ts";
import { listRedhotItems } from "../redhot-apps/registry.ts";
import type { LauncherItem } from "../redhot-apps/types.ts";
import { runCommandItem } from "../terminals/actions.ts";
import { toDisplayName } from "./aliases.ts";
import { openApp } from "./apps.ts";
import { formatHotkey } from "./hotkeys.ts";
import { runItemSettings } from "./item-settings.ts";
import { promptForSelection } from "./prompt.ts";
import type { LauncherOption } from "./prompt.ts";
import { drawScreen } from "./screen.ts";

const NAME_COLUMN_WIDTH = 22;
const HOTKEY_COLUMN_WIDTH = 8;
const DIAGRAM_WIDTH = 5;
const MIN_VISIBLE_ROWS = 8;
// The logo, title, notice, search bar and footer.
const ROWS_AROUND_LIST = 16;
const FALLBACK_WINDOW_ROWS = 24;
const APP_ICON = styleText("cyan", "◆");
const COMMAND_ICON = toRedhotIcon("⌘");
const NOT_SET = "not set";

export type HotkeyEntry = Pick<
  LauncherItem,
  "value" | "name" | "icon" | "diagram" | "hint" | "run"
>;

interface HotkeyList {
  title: string;
  icon: string;
  /** Read again each round, so a hotkey changed in settings shows straight away. */
  getEntries: (hotkeys: HotkeyMap) => HotkeyEntry[];
}

/** Fills a tall window, so the whole list can be read without scrolling. */
export const toVisibleRows = (windowRows: number): number =>
  Math.max(MIN_VISIBLE_ROWS, windowRows - ROWS_AROUND_LIST);

export const toHotkeyRow = (
  { icon, name, diagram, hint }: HotkeyEntry,
  hotkey: string | undefined,
): string => {
  // A row with no diagram keeps its space, so names line up in a mixed list.
  const picture = diagram ?? `${icon}${" ".repeat(DIAGRAM_WIDTH - 1)}`;
  const symbols = (hotkey === undefined ? NOT_SET : formatHotkey(hotkey)).padEnd(
    HOTKEY_COLUMN_WIDTH,
  );
  const styled = styleText(hotkey === undefined ? "gray" : "yellow", symbols);
  const words = hint === undefined ? "" : styleText("gray", hint);
  return `${picture} ${name.padEnd(NAME_COLUMN_WIDTH)} ${styled} ${words}`.trimEnd();
};

const toOption = (entry: HotkeyEntry, aliases: AliasMap, hotkeys: HotkeyMap): LauncherOption => {
  const hotkey = hotkeys[entry.value];
  return {
    value: entry.value,
    name: entry.name,
    // The hotkey is searchable too, so typing "ctrl+option" finds what uses those keys.
    aliases: [...(aliases[entry.value] ?? []), ...(hotkey === undefined ? [] : [hotkey])],
    label: toHotkeyRow(entry, hotkey),
  };
};

const toAppEntry = (path: string): HotkeyEntry => ({
  value: path,
  name: toDisplayName(path),
  icon: APP_ICON,
  run: async () => {
    await openApp(path);
    return "";
  },
});

const toCommandEntry = (value: string): HotkeyEntry => ({
  value,
  name: toDisplayName(value),
  icon: COMMAND_ICON,
  run: async () => {
    await runCommandItem(value);
    return "";
  },
});

const toEntry = (value: string, items: readonly LauncherItem[]): HotkeyEntry | undefined => {
  const item = items.find((candidate) => candidate.value === value);
  if (item !== undefined) {
    return item;
  }
  if (value.startsWith("/")) {
    return toAppEntry(value);
  }
  return value.startsWith("command:") ? toCommandEntry(value) : undefined;
};

/** Everything with a saved hotkey, by name. A hotkey for something now gone is left out. */
export const listSavedHotkeys = (hotkeys: HotkeyMap): HotkeyEntry[] => {
  const items = listRedhotItems();
  return Object.keys(hotkeys)
    .flatMap((value) => toEntry(value, items) ?? [])
    .toSorted((first, second) => first.name.localeCompare(second.name));
};

// One that fails shouldn't take the list down with it.
const runEntry = async ({ run }: HotkeyEntry): Promise<string> => {
  try {
    return await run();
  } catch (error) {
    return styleText("red", error instanceof Error ? error.message : String(error));
  }
};

/** Shows the list once. Returns the line to show next, or undefined when finished. */
const runListRound = async (
  { title, icon, getEntries }: HotkeyList,
  notice: string,
): Promise<string | undefined> => {
  const { aliases, hotkeys } = await readConfig();
  const entries = getEntries(hotkeys);
  drawScreen({ title, icon, notice });
  const options = entries.map((entry) => toOption(entry, aliases, hotkeys));
  const { cancelled, value, wantsSettings } = await promptForSelection(
    () => options,
    "Search hotkeys",
    {
      listWhenEmpty: true,
      enterLabel: "run",
      replaceable: true,
      maxVisibleResults: toVisibleRows(process.stdout.rows ?? FALLBACK_WINDOW_ROWS),
    },
  );
  const entry = entries.find((candidate) => candidate.value === value);
  if (cancelled || entry === undefined) {
    return undefined;
  }
  if (wantsSettings) {
    await runItemSettings(entry.value, entry.name);
    return "";
  }
  return runEntry(entry);
};

/** Stays open after running something, so you can try several in a row. */
export const runHotkeyList = async (list: HotkeyList): Promise<string> => {
  let notice = await runListRound(list, "");
  while (notice !== undefined) {
    notice = await runListRound(list, notice);
  }
  return "";
};
