import { styleText } from "node:util";
import { isCancel, select, spinner } from "@clack/prompts";
import { drawScreen } from "../../launcher/screen.ts";
import {
  disableLoginItem,
  enableLoginItem,
  hasLoginItem,
  openLoginItemsSettings,
  readLoginItemState,
} from "../../menubar/login-item.ts";
import type { LoginItemState } from "../../menubar/login-item.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";

const APP_ID = "medea-settings";
const OPEN_ID = "open";
const NAME = "Settings (Medea)";
const ICON = styleText("magenta", "⚙");
const START_AT_LOGIN = "start-at-login";
const DONE = "done";

const STATE_LABELS: Record<LoginItemState, string> = {
  on: styleText("green", "● On"),
  off: styleText("gray", "○ Off"),
  blocked: styleText("yellow", "▲ Blocked in System Settings"),
};

const toggleStartAtLogin = async (state: LoginItemState): Promise<string> => {
  if (state === "blocked") {
    await openLoginItemsSettings();
    return 'Turn on medea-status under "Allow in the Background", then come back';
  }
  if (state === "on") {
    await disableLoginItem();
    return "Medea won't start at login";
  }
  await enableLoginItem();
  return 'Medea will start at login. macOS may show a "Background Items Added" notice';
};

const checkLoginItem = async (): Promise<LoginItemState> => {
  if (!hasLoginItem()) {
    return "off";
  }
  const progress = spinner();
  progress.start("Checking System Settings");
  try {
    return await readLoginItemState();
  } finally {
    progress.clear();
  }
};

/** Shows the menu once. Returns the line to show next, or undefined when finished. */
const runSettingsRound = async (notice: string): Promise<string | undefined> => {
  drawScreen(notice);
  const state = await checkLoginItem();
  const choice = await select({
    message: NAME,
    options: [
      {
        value: START_AT_LOGIN,
        label: `Start at login  ${STATE_LABELS[state]}`,
        hint: "Keeps Medea in the menu bar",
      },
      { value: DONE, label: "Done" },
    ],
  });
  if (isCancel(choice) || choice === DONE) {
    return undefined;
  }
  return toggleStartAtLogin(state);
};

const openSettings = async (): Promise<string> => {
  let notice = await runSettingsRound("");
  while (notice !== undefined) {
    notice = await runSettingsRound(notice);
  }
  return "";
};

const openItem: LauncherItem = {
  value: `${APP_ID}:${OPEN_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  needsWindow: true,
  run: openSettings,
};

export const medeaSettings: MedeaApp = {
  id: APP_ID,
  listItems: () => [openItem],
  listSettingsActions: () => [],
};
