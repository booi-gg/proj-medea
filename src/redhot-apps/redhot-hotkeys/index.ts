import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";

const APP_ID = "redhot-hotkeys";
const SHOW_ALL_ID = "show-all";
const NAME = "Hotkeys, Show All";
const ICON = toRedhotIcon("⌘");

// Loaded late because the list needs the registry, which loads this file.
const showAllHotkeys = async (): Promise<string> => {
  const { listSavedHotkeys, runHotkeyList } = await import("../../launcher/hotkey-list.ts");
  return runHotkeyList({
    title: NAME,
    icon: ICON,
    getEntries: listSavedHotkeys,
  });
};

const showAllItem: LauncherItem = {
  value: `${APP_ID}:${SHOW_ALL_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  needsWindow: true,
  run: showAllHotkeys,
};

export const hotkeyList: RedhotApp = {
  id: APP_ID,
  listItems: () => [showAllItem],
  listSettingsActions: () => [],
};
