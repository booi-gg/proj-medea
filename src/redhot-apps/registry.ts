import { clipboardHistory } from "./redhot-clipboard-history/index.ts";
import { hotkeyList } from "./redhot-hotkeys/index.ts";
import { redhotLogs } from "./redhot-logs/index.ts";
import { quicklinks } from "./redhot-quicklinks/index.ts";
import { scripts } from "./redhot-scripts/index.ts";
import { redhotSettings } from "./redhot-settings/index.ts";
import { windowActions } from "./redhot-window/index.ts";
import type { LauncherItem, RedhotApp, SettingsAction } from "./types.ts";

const redhotApps: readonly RedhotApp[] = [
  quicklinks,
  scripts,
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

export const listSettingsActions = (itemValue: string): SettingsAction[] =>
  redhotApps.flatMap((app) => app.listSettingsActions(itemValue));
