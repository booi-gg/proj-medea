import type { LauncherItem, RedhotApp } from "../types.ts";
import {
  PORTS_SCREEN_ICON,
  PORTS_SCREEN_NAME,
  SCREEN_ICON,
  SCREEN_NAME,
  runPortScreen,
  runProcessScreen,
} from "./screen.ts";

const APP_ID = "redhot-processes";
const SEARCH_ID = "search";
const PORTS_ID = "ports";

const PROCESS_SEARCH_VALUE = `${APP_ID}:${SEARCH_ID}`;
export const PORTS_SEARCH_VALUE = `${APP_ID}:${PORTS_ID}`;

const searchItem: LauncherItem = {
  value: PROCESS_SEARCH_VALUE,
  name: SCREEN_NAME,
  icon: SCREEN_ICON,
  kind: "Command",
  hint: "Quit an app or process",
  needsWindow: true,
  run: (context) => runProcessScreen("", context?.closesWhenDone),
};

const portsItem: LauncherItem = {
  value: PORTS_SEARCH_VALUE,
  name: PORTS_SCREEN_NAME,
  icon: PORTS_SCREEN_ICON,
  kind: "Command",
  hint: "See every port in use and pick one to free up",
  needsWindow: true,
  run: (context) => runPortScreen("", context?.closesWhenDone),
};

export const processes: RedhotApp = {
  id: APP_ID,
  listItems: () => [searchItem, portsItem],
  listSettingsActions: () => [],
};
