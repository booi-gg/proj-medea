import type { LauncherItem, RedhotApp } from "../types.ts";
import { SCREEN_ICON, SCREEN_NAME, runProcessScreen } from "./screen.ts";

const APP_ID = "redhot-processes";
const SEARCH_ID = "search";

export const PROCESS_SEARCH_VALUE = `${APP_ID}:${SEARCH_ID}`;

const searchItem: LauncherItem = {
  value: PROCESS_SEARCH_VALUE,
  name: SCREEN_NAME,
  icon: SCREEN_ICON,
  kind: "Command",
  hint: "Quit an app or process, or free up a port",
  needsWindow: true,
  run: (context) => runProcessScreen("", context?.closesWhenDone),
};

export const processes: RedhotApp = {
  id: APP_ID,
  listItems: () => [searchItem],
  listSettingsActions: () => [],
};
