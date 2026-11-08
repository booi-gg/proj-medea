import { clipboardHistory } from "./redhot-clipboard-history/index.ts";
import { files } from "./redhot-files/index.ts";
import { hotkeyList } from "./redhot-hotkeys/index.ts";
import { redhotLogs } from "./redhot-logs/index.ts";
import { quicklinks } from "./redhot-quicklinks/index.ts";
import { scripts } from "./redhot-scripts/index.ts";
import { redhotSettings } from "./redhot-settings/index.ts";
import { windowActions } from "./redhot-window/index.ts";
import type { HotkeyMap } from "../config.ts";
import type { LauncherItem, RedhotApp, SettingsAction } from "./types.ts";

const redhotApps: readonly RedhotApp[] = [
  quicklinks,
  scripts,
  files,
  clipboardHistory,
  windowActions,
  hotkeyList,
  redhotLogs,
  redhotSettings,
];

export const listRedhotApps = (): readonly RedhotApp[] => redhotApps;

export const listRedhotItems = (): LauncherItem[] => redhotApps.flatMap((app) => app.listItems());

export const findRedhotItem = (itemValue: string | undefined): LauncherItem | undefined =>
  listRedhotItems().find((item) => item.value === itemValue);

/**
 * Leaves out hotkeys for items that no longer exist, like a deleted script, so a dead entry can't
 * hold a key or block it from being used. The saved settings aren't changed, so a script that's
 * only been moved for a moment gets its hotkey back. Apps and built-in commands aren't listed here.
 */
export const withoutRemovedItems = (hotkeys: HotkeyMap): HotkeyMap => {
  const values = new Set(listRedhotItems().map(({ value }) => value));
  return Object.fromEntries(
    Object.entries(hotkeys).filter(
      ([value]) => value.startsWith("/") || value.startsWith("command:") || values.has(value),
    ),
  );
};

/** The name search shows for an item, when it's one of Redhot's. */
export const findRedhotItemName = (itemValue: string): string | undefined =>
  findRedhotItem(itemValue)?.name;

export const listSettingsActions = (itemValue: string): SettingsAction[] =>
  redhotApps.flatMap((app) => app.listSettingsActions(itemValue));
