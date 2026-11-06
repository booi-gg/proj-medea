import { toMedeaIcon } from "../icon.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";

const APP_ID = "medea-hotkeys";
const SHOW_ALL_ID = "show-all";
const NAME = "Hotkeys, Show All";
const ICON = toMedeaIcon("⌘");

// Loaded late because the list needs the registry, which loads this file.
const showAllHotkeys = async (): Promise<string> => {
  const { listSavedHotkeys, runHotkeyList } = await import("../../launcher/hotkey-list.ts");
  return runHotkeyList({ title: NAME, icon: ICON, getEntries: listSavedHotkeys });
};

const showAllItem: LauncherItem = {
  value: `${APP_ID}:${SHOW_ALL_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  needsWindow: true,
  run: showAllHotkeys,
};

export const hotkeyList: MedeaApp = {
  id: APP_ID,
  listItems: () => [showAllItem],
  listSettingsActions: () => [],
};
