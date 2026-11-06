import { readConfig, updateConfig } from "../../config.ts";
import { reloadHotkeys } from "../../menubar/helper.ts";
import { sendHelperRequest } from "../../menubar/helper-socket.ts";
import { toMedeaIcon } from "../icon.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";
import { APP_ID, WINDOW_ACTIONS, addDefaultHotkeys, toWindowValue } from "./actions.ts";
import type { WindowAction } from "./actions.ts";

const ICON = toMedeaIcon("▣");
const OK_REPLY = "ok";
const ADD_HOTKEYS_ID = "add-default-hotkeys";
const NO_HELPER_MESSAGE = "Window actions need the menu bar item. Use Add Menu Bar Item first";

// The keys are the helper's replies, from WindowFailure in native/WindowManager.swift.
const FAILURE_MESSAGES: Record<string, string> = {
  "no-access": "Allow medea-status under Accessibility in System Settings, then try again",
  "no-window": "No window to move",
  "full-screen": "A full-screen window can't be moved",
  "not-movable": "That window can't be moved",
  "nothing-to-restore": "Medea hasn't moved that window",
  "one-display": "There's only one display",
};

const runWindowCommand = async (command: string): Promise<string> => {
  const reply = await sendHelperRequest(`window ${command}`);
  if (reply === undefined) {
    throw new Error(NO_HELPER_MESSAGE);
  }
  if (reply !== OK_REPLY) {
    throw new Error(FAILURE_MESSAGES[reply] ?? `The window couldn't be moved: ${reply}`);
  }
  return "";
};

const toItem = ({ id, name, command }: WindowAction): LauncherItem => ({
  value: toWindowValue(id),
  name,
  icon: ICON,
  kind: "Window",
  run: () => runWindowCommand(command),
});

const installDefaultHotkeys = async (): Promise<string> => {
  const { hotkeys, added } = addDefaultHotkeys((await readConfig()).hotkeys);
  if (added === 0) {
    return "Window hotkeys are already set";
  }
  await updateConfig({ hotkeys });
  await reloadHotkeys();
  return `Added ${added} window hotkeys`;
};

const addHotkeysItem: LauncherItem = {
  value: toWindowValue(ADD_HOTKEYS_ID),
  name: "Window Hotkeys, Add Defaults",
  icon: ICON,
  kind: "Command",
  run: installDefaultHotkeys,
};

const items: readonly LauncherItem[] = [...WINDOW_ACTIONS.map(toItem), addHotkeysItem];

export const windowActions: MedeaApp = {
  id: APP_ID,
  listItems: () => [...items],
  listSettingsActions: () => [],
};
