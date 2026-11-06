import { styleText } from "node:util";
import { confirm, intro, isCancel, log, select, text } from "@clack/prompts";
import { readConfig } from "../config.ts";
import { listSettingsActions } from "../medea-apps/registry.ts";
import { reloadHotkeys } from "../menubar/helper.ts";
import { MAX_ALIASES, findAliasProblem, parseAliasInput, saveAliases } from "./aliases.ts";
import { recordKeys } from "./hotkey-recorder.ts";
import { findHotkeyProblem, formatHotkey, parseRecording, saveHotkey } from "./hotkeys.ts";

export const ADD_ALIAS_LABEL = "Alias, Add (Medea)";
export const CREATE_HOTKEY_LABEL = "Hotkey, Create (Medea)";

const ADD_ALIAS = "add-alias";
const CREATE_HOTKEY = "create-hotkey";
const REMOVE_HOTKEY = "remove-hotkey";
const DONE = "done";

const withCurrentValue = (label: string, current: string): string =>
  current === "" ? label : `${label}  ${styleText("cyan", current)}`;

const editAliases = async (itemValue: string): Promise<void> => {
  const { aliases } = await readConfig();
  const input = await text({
    message: `Up to ${MAX_ALIASES} aliases, separated by commas`,
    placeholder: "Leave empty for none",
    initialValue: (aliases[itemValue] ?? []).join(", "),
    validate: (value) => findAliasProblem(parseAliasInput(value ?? ""), itemValue, aliases),
  });
  if (!isCancel(input)) {
    await saveAliases(itemValue, parseAliasInput(input));
  }
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

const createHotkey = async (itemValue: string): Promise<void> => {
  log.info("Press your hotkey in the Record Hotkey window");
  const output = await recordKeys();
  if (output === undefined) {
    log.info("Hotkey not changed");
    return;
  }
  const recording = parseRecording(output);
  if (recording === undefined) {
    log.warn("That key can't be used for a hotkey");
    return;
  }
  if (recording.kind === "interrupted") {
    log.warn("Another app took focus while you held the keys, so that shortcut may be in use");
    return;
  }
  const { hotkey, usedBySystem } = recording;
  const { hotkeys } = await readConfig();
  const problem = findHotkeyProblem(hotkey, itemValue, hotkeys);
  if (problem !== undefined) {
    log.warn(`${formatHotkey(hotkey)}: ${problem}`);
    return;
  }
  if (usedBySystem && !(await confirmSystemShortcut(hotkey))) {
    log.info("Hotkey not changed");
    return;
  }
  await applyHotkey(itemValue, hotkey);
  log.success(`Hotkey set to ${formatHotkey(hotkey)}`);
};

/** Shows the menu once. Returns false when the user is finished. */
const runSettingsRound = async (itemValue: string): Promise<boolean> => {
  const { aliases, hotkeys } = await readConfig();
  const hotkey = hotkeys[itemValue] ?? "";
  const aliasTags = (aliases[itemValue] ?? []).map((alias) => `[${alias}]`).join(" ");
  const appActions = listSettingsActions(itemValue);

  const choice = await select({
    message: "What do you want to change?",
    options: [
      { value: ADD_ALIAS, label: withCurrentValue(ADD_ALIAS_LABEL, aliasTags) },
      { value: CREATE_HOTKEY, label: withCurrentValue(CREATE_HOTKEY_LABEL, formatHotkey(hotkey)) },
      ...(hotkey === "" ? [] : [{ value: REMOVE_HOTKEY, label: "Remove hotkey" }]),
      ...appActions.map(({ label }) => ({ value: label, label })),
      { value: DONE, label: "Done" },
    ],
  });

  if (isCancel(choice) || choice === DONE) {
    return false;
  }
  const appAction = appActions.find(({ label }) => label === choice);
  if (appAction !== undefined) {
    return appAction.run();
  }
  if (choice === ADD_ALIAS) {
    await editAliases(itemValue);
  }
  if (choice === CREATE_HOTKEY) {
    await createHotkey(itemValue);
  }
  if (choice === REMOVE_HOTKEY) {
    await applyHotkey(itemValue, "");
    log.success("Hotkey removed");
  }
  return true;
};

/** The settings screen for one item. It runs in the search window, then search comes back. */
export const runItemSettings = async (itemValue: string, itemName: string): Promise<void> => {
  intro(itemName);
  let keepGoing = true;
  while (keepGoing) {
    keepGoing = await runSettingsRound(itemValue);
  }
};
