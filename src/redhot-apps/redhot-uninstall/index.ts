import { basename } from "node:path";
import type { LauncherItem, RedhotApp, SettingsAction } from "../types.ts";
import { canUninstall } from "./bundle.ts";
import { SCREEN_ICON, SCREEN_NAME, runUninstall, runUninstallScreen } from "./screen.ts";

const APP_ID = "redhot-uninstall";
const PICK_ID = "pick";
const APP_EXTENSION = ".app";
// Singular, because this one is on a single app's settings.
const SETTINGS_ACTION_LABEL = "Uninstall App";

const pickItem: LauncherItem = {
  value: `${APP_ID}:${PICK_ID}`,
  name: SCREEN_NAME,
  icon: SCREEN_ICON,
  kind: "Command",
  hint: "Move an app and its data to the Trash",
  needsWindow: true,
  run: runUninstallScreen,
};

const listSettingsActions = (itemValue: string): SettingsAction[] => {
  if (!canUninstall(itemValue)) {
    return [];
  }
  const app = { name: basename(itemValue, APP_EXTENSION), path: itemValue };
  return [
    {
      label: SETTINGS_ACTION_LABEL,
      run: async () => {
        const { wasUninstalled, notice } = await runUninstall(app);
        return wasUninstalled ? notice : true;
      },
    },
  ];
};

export const uninstaller: RedhotApp = {
  id: APP_ID,
  listItems: () => [pickItem],
  listSettingsActions,
};
