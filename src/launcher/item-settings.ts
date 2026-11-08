import { styleText } from "node:util";
import { confirm, isCancel, log, select, text } from "@clack/prompts";
import { readConfig } from "../config.ts";
import {
  findRedhotItemName,
  listSettingsActions,
  withoutRemovedItems,
} from "../redhot-apps/registry.ts";
import { reloadHotkeys } from "../menubar/helper.ts";
import {
  MAX_ALIASES,
  findAliasProblem,
  parseAliasInput,
  saveAliases,
  toDisplayName,
} from "./aliases.ts";
import { recordKeys } from "./hotkey-recorder.ts";
import { findHotkeyProblem, formatHotkey, parseRecording, saveHotkey } from "./hotkeys.ts";
import { drawScreen } from "./screen.ts";

export const ADD_ALIAS_LABEL = "Alias, Add";
export const CREATE_HOTKEY_LABEL = "Hotkey, Create";

const ADD_ALIAS = "add-alias";
const CREATE_HOTKEY = "create-hotkey";
const REMOVE_HOTKEY = "remove-hotkey";
const DONE = "done";

const withCurrentValue = (label: string, current: string): string =>
  current === "" ? label : `${label}  ${styleText("cyan", current)}`;

/** Returns the line to show when back in the menu. */
const editAliases = async (itemValue: string, itemName: string): Promise<string> => {
  drawScreen({ title: `Add Alias for ${itemName}` });
  const { aliases } = await readConfig();
  const input = await text({
    message: `Up to ${MAX_ALIASES} aliases, separated by commas`,
    placeholder: "Leave empty for none",
    initialValue: (aliases[itemValue] ?? []).join(", "),
    validate: (value) => findAliasProblem(parseAliasInput(value ?? "")),
  });
  if (isCancel(input)) {
    return "";
  }
  await saveAliases(itemValue, parseAliasInput(input));
  return "Aliases saved";
};

const applyHotkey = async (itemValue: string, hotkey: string): Promise<void> => {
  await saveHotkey(itemValue, hotkey);
  await reloadHotkeys();
};

const confirmSystemShortcut = async (hotkey: string): Promise<boolean> => {
  const answer = await confirm({
    message: `${formatHotkey(hotkey)} is already a macOS shortcut. Use it anyway?`,
    initialValue: false,
  });
  return answer === true;
};

const toWarning = (message: string): string => styleText("yellow", message);

/** Returns the line to show when back in the menu. */
const createHotkey = async (itemValue: string, itemName: string): Promise<string> => {
  drawScreen({ title: `Create Hotkey for ${itemName}` });
  log.info("Press your hotkey in the Record Hotkey window");
  const output = await recordKeys();
  if (output === undefined) {
    return "Hotkey not changed";
  }
  const recording = parseRecording(output);
  if (recording === undefined) {
    return toWarning("That key can't be used for a hotkey");
  }
  if (recording.kind === "interrupted") {
    return toWarning(
      "Another app took focus while you held the keys, so that shortcut may be in use",
    );
  }
  const { hotkey, usedBySystem } = recording;
  const { hotkeys } = await readConfig();
  const problem = findHotkeyProblem(
    hotkey,
    itemValue,
    withoutRemovedItems(hotkeys),
    (value) => findRedhotItemName(value) ?? toDisplayName(value),
  );
  if (problem !== undefined) {
    return toWarning(`${formatHotkey(hotkey)}: ${problem}`);
  }
  if (usedBySystem && !(await confirmSystemShortcut(hotkey))) {
    return "Hotkey not changed";
  }
  await applyHotkey(itemValue, hotkey);
  return `Hotkey set to ${formatHotkey(hotkey)}`;
};

/** Shows the menu once. Returns the line to show next, or undefined when finished. */
const runSettingsRound = async (
  itemValue: string,
  itemName: string,
  notice: string,
): Promise<string | undefined> => {
  drawScreen({ title: `${itemName} Settings`, notice });
  const { aliases, hotkeys } = await readConfig();
  const hotkey = hotkeys[itemValue] ?? "";
  const aliasTags = (aliases[itemValue] ?? []).map((alias) => `[${alias}]`).join(" ");
  const appActions = listSettingsActions(itemValue);

  const choice = await select({
    message: "What do you want to change?",
    options: [
      { value: ADD_ALIAS, label: withCurrentValue(ADD_ALIAS_LABEL, aliasTags) },
      {
        value: CREATE_HOTKEY,
        label: withCurrentValue(CREATE_HOTKEY_LABEL, formatHotkey(hotkey)),
      },
      ...(hotkey === "" ? [] : [{ value: REMOVE_HOTKEY, label: "Remove hotkey" }]),
      ...appActions.map(({ label }) => ({ value: label, label })),
      { value: DONE, label: "Done" },
    ],
  });

  if (isCancel(choice) || choice === DONE) {
    return undefined;
  }
  const appAction = appActions.find(({ label }) => label === choice);
  if (appAction !== undefined) {
    return (await appAction.run()) ? "" : undefined;
  }
  if (choice === ADD_ALIAS) {
    return editAliases(itemValue, itemName);
  }
  if (choice === CREATE_HOTKEY) {
    return createHotkey(itemValue, itemName);
  }
  await applyHotkey(itemValue, "");
  return "Hotkey removed";
};

/** The settings screen for one item. It runs in the search window, then search comes back. */
export const runItemSettings = async (itemValue: string, itemName: string): Promise<void> => {
  let notice = await runSettingsRound(itemValue, itemName, "");
  while (notice !== undefined) {
    notice = await runSettingsRound(itemValue, itemName, notice);
  }
};
