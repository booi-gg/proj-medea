import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";
import { confirm, isCancel, log, password, select, spinner, text } from "@clack/prompts";
import stringWidth from "string-width";
import { formatHotkey } from "../../launcher/hotkeys.ts";
import type { HotkeyEntry } from "../../launcher/hotkey-list.ts";
import { drawScreen, toTerminalWidth } from "../../launcher/screen.ts";
import { scriptsDir } from "../../paths.ts";
import { runCommand } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp, SettingsAction } from "../types.ts";
import { prepareAnswer } from "./parse.ts";
import type { ScriptArgument, ScriptMode } from "./parse.ts";
import { keepColorsOnly, notify, runScriptFile, toFailureLine, toLastLine } from "./run.ts";
import type { ScriptResult } from "./run.ts";
import { listScripts } from "./store.ts";
import type { Script } from "./store.ts";

const APP_ID = "redhot-scripts";
const CREATE_ID = "create";
const OPEN_FOLDER_ID = "open-folder";
const SHOW_ALL_ID = "show-all";
const SCRIPT_ICON = toRedhotIcon("$");
const CREATE_NAME = "Script, Create";
const OPEN_FOLDER_NAME = "Scripts, Open Folder";
const SHOW_ALL_NAME = "Scripts, Show All";
const ICON_COLUMN_WIDTH = 2;
const NAME_COLUMN_WIDTH = 38;
const HOTKEY_COLUMN_WIDTH = 8;
const GROUP_COLUMN_WIDTH = 22;
const ELLIPSIS = "…";
const NON_WORD = /[^a-z0-9]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;
// An emoji or a single symbol. Image paths and URLs can't be drawn in a terminal.
const MAX_ICON_WIDTH = 2;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

const toValue = (id: string): string => `${APP_ID}:${id}`;
// Under its own prefix, so a script file named "create" can't take the create command's value.
const toScriptValue = (script: Script): string => toValue(`script/${script.id}`);

/**
 * Some emoji, like ⏱️ and 🗑, are drawn two columns wide while Terminal only moves one, so they'd
 * cover the space after them. One more space keeps a gap before the title.
 */
export const toIcon = (icon: string | undefined): string => {
  const isDrawable =
    icon !== undefined &&
    !icon.includes("/") &&
    !icon.includes(".") &&
    stringWidth(icon) > 0 &&
    stringWidth(icon) <= MAX_ICON_WIDTH;
  if (!isDrawable) {
    return SCRIPT_ICON;
  }
  return PICTOGRAPH.test(icon) && toTerminalWidth(icon) === 1 ? `${icon} ` : icon;
};

const needsWindow = (script: Script): boolean =>
  script.arguments.length > 0 || script.mode === "fullOutput" || script.needsConfirmation;

const isBlank = (value: string | undefined): boolean => (value ?? "").trim() === "";

const askForAnswer = async (
  script: Script,
  argument: ScriptArgument,
  position: number,
): Promise<string | undefined> => {
  const label = argument.placeholder === "" ? `Argument ${position}` : argument.placeholder;
  const message = `${script.title}: ${label}${argument.optional ? " (optional)" : ""}`;
  const validate = (value: string | undefined): string | undefined =>
    isBlank(value) && !argument.optional ? "Enter a value" : undefined;
  if (argument.type === "dropdown") {
    const choice = await select({
      message,
      options: [
        ...argument.choices.map(({ title, value }) => ({ value, label: title })),
        ...(argument.optional ? [{ value: "", label: "None" }] : []),
      ],
    });
    return isCancel(choice) ? undefined : choice;
  }
  const answer =
    argument.type === "password"
      ? await password({ message, validate })
      : await text({ message, placeholder: argument.placeholder, validate });
  return isCancel(answer) ? undefined : answer.trim();
};

/** Asks for each argument in order. Returns undefined when cancelled. */
const askForAnswers = async (script: Script): Promise<string[] | undefined> => {
  const answers: string[] = [];
  for (const [index, argument] of script.arguments.entries()) {
    const answer = await askForAnswer(script, argument, index + 1);
    if (answer === undefined) {
      return undefined;
    }
    answers.push(prepareAnswer(argument, answer));
  }
  return answers;
};

const runWithSpinner = async (
  script: Script,
  answers: readonly string[],
  isInteractive: boolean,
): Promise<ScriptResult> => {
  const progress = isInteractive ? spinner() : undefined;
  progress?.start(`Running ${script.title}`);
  try {
    return await runScriptFile(script, answers);
  } finally {
    progress?.clear();
  }
};

const showFullOutput = async (script: Script, result: ScriptResult): Promise<string> => {
  const output = keepColorsOnly([result.stdout, result.stderr].join("\n").trimEnd());
  log.message(output === "" ? styleText("dim", "No output") : output);
  if (result.failed) {
    log.error(`${script.title} failed`);
  }
  await select({ message: "Done", options: [{ value: "back", label: "Back to search" }] });
  return "";
};

/** Runs a script from search or a hotkey. Resolves to the line to show above the search bar. */
const runScript = async (script: Script): Promise<string> => {
  if (script.problem !== undefined) {
    throw new Error(`${script.title}: ${script.problem}`);
  }
  // A hotkey runs a script with no window when it asks nothing, so there's nowhere to draw.
  const isInteractive = process.stdout.isTTY === true;
  if (isInteractive) {
    drawScreen({ title: script.title, icon: toIcon(script.icon) });
  }
  if (script.needsConfirmation) {
    const answer = await confirm({ message: `Run ${script.title}?`, initialValue: false });
    if (answer !== true) {
      return "";
    }
  }
  const answers = await askForAnswers(script);
  if (answers === undefined) {
    return "";
  }
  const result = await runWithSpinner(script, answers, isInteractive);
  if (script.mode === "fullOutput" && isInteractive) {
    return showFullOutput(script, result);
  }
  // "inline" runs when chosen, like "compact". Refreshing it on a timer is still to do.
  const line = result.failed ? toFailureLine(result, script.title) : toLastLine(result.stdout);
  if (!isInteractive && line !== "") {
    await notify(script.title, line);
  }
  if (result.failed) {
    throw new Error(line);
  }
  return line;
};

const toItem = (script: Script): LauncherItem => ({
  value: toScriptValue(script),
  name: script.title,
  icon: toIcon(script.icon),
  kind: script.problem === undefined ? "Script" : "Script ▲",
  ...(script.description === undefined && script.packageName === undefined
    ? {}
    : { hint: script.description ?? script.packageName }),
  needsWindow: needsWindow(script),
  run: () => runScript(script),
});

/** Cuts text to a width on screen, then pads it, so wide emoji and long titles keep columns straight. */
const fitToWidth = (text: string, width: number): string => {
  let fitted = text;
  if (toTerminalWidth(fitted) > width) {
    while (toTerminalWidth(`${fitted}${ELLIPSIS}`) > width) {
      fitted = fitted.slice(0, -1);
    }
    fitted = `${fitted}${ELLIPSIS}`;
  }
  return `${fitted}${" ".repeat(Math.max(0, width - toTerminalWidth(fitted)))}`;
};

export const toScriptRow = (
  { icon, name, hint }: HotkeyEntry,
  hotkey: string | undefined,
): string => {
  const symbols = fitToWidth(hotkey === undefined ? "" : formatHotkey(hotkey), HOTKEY_COLUMN_WIDTH);
  const group = hint === undefined ? "" : fitToWidth(hint, GROUP_COLUMN_WIDTH);
  return [
    fitToWidth(icon, ICON_COLUMN_WIDTH),
    fitToWidth(name, NAME_COLUMN_WIDTH),
    styleText("yellow", symbols),
    styleText("gray", group),
  ]
    .join(" ")
    .trimEnd();
};

const toListEntry = (script: Script): HotkeyEntry => {
  const group = script.problem === undefined ? script.packageName : "▲ Needs fixing";
  return {
    value: toScriptValue(script),
    name: script.title,
    icon: toIcon(script.icon),
    ...(group === undefined ? {} : { hint: group }),
    run: () => runScript(script),
  };
};

// Loaded late because the list needs the registry, which loads this file.
const showAllScripts = async (): Promise<string> => {
  if (listScripts().length === 0) {
    return `No scripts yet. Search ${CREATE_NAME} to make one`;
  }
  const { runHotkeyList } = await import("../../launcher/hotkey-list.ts");
  return runHotkeyList({
    title: SHOW_ALL_NAME,
    icon: SCRIPT_ICON,
    placeholder: "Search scripts",
    getEntries: () => listScripts().map(toListEntry),
    toRow: toScriptRow,
  });
};

export const toFileName = (title: string, taken: (name: string) => boolean): string => {
  const base =
    title.toLowerCase().replaceAll(NON_WORD, "-").replaceAll(EDGE_DASHES, "") || "script";
  let name = `${base}.sh`;
  for (let copy = 2; taken(name); copy += 1) {
    name = `${base}-${copy}.sh`;
  }
  return name;
};

export const toScriptTemplate = (title: string, mode: ScriptMode): string =>
  [
    "#!/bin/bash",
    "",
    "# Redhot reads these lines to list the script in search.",
    `# @redhot.title ${title}`,
    `# @redhot.mode ${mode}`,
    "",
    "# To ask for a value before running, add a line like this one without the first #.",
    "# The answer arrives as $1:",
    '# # @redhot.argument1 { "type": "text", "placeholder": "name" }',
    "",
    'echo "Hello from Redhot"',
    "",
  ].join("\n");

const MODE_CHOICES: { value: ScriptMode; label: string; hint: string }[] = [
  { value: "compact", label: "Compact", hint: "Shows the last line of output" },
  { value: "fullOutput", label: "Full output", hint: "Shows everything the script prints" },
  { value: "silent", label: "Silent", hint: "Shows only the last line, if any" },
];

const openScriptsFolder = async (): Promise<string> => {
  await mkdir(scriptsDir, { recursive: true });
  await runCommand("open", [scriptsDir]);
  return "";
};

const createScript = async (): Promise<string> => {
  drawScreen({ title: CREATE_NAME, icon: SCRIPT_ICON });
  const title = await text({
    message: "Name",
    placeholder: "Kill Port",
    validate: (value) => (isBlank(value) ? "Enter a name" : undefined),
  });
  if (isCancel(title)) {
    return "";
  }
  const mode = await select({ message: "Show", options: MODE_CHOICES });
  if (isCancel(mode)) {
    return "";
  }
  await mkdir(scriptsDir, { recursive: true });
  const fileName = toFileName(title.trim(), (name) => existsSync(join(scriptsDir, name)));
  const path = join(scriptsDir, fileName);
  await writeFile(path, toScriptTemplate(title.trim(), mode), { flag: "wx" });
  await chmod(path, 0o755);
  // Opens in the person's text editor, so they can write the script straight away.
  await runCommand("open", ["-t", path]);
  return `Created ${fileName} in ${scriptsDir}`;
};

const createItem: LauncherItem = {
  value: toValue(CREATE_ID),
  name: CREATE_NAME,
  icon: SCRIPT_ICON,
  kind: "Command",
  hint: "Write a new script command",
  needsWindow: true,
  run: createScript,
};

const showAllItem: LauncherItem = {
  value: toValue(SHOW_ALL_ID),
  name: SHOW_ALL_NAME,
  icon: SCRIPT_ICON,
  kind: "Command",
  hint: "Browse and run your scripts",
  needsWindow: true,
  run: showAllScripts,
};

const openFolderItem: LauncherItem = {
  value: toValue(OPEN_FOLDER_ID),
  name: OPEN_FOLDER_NAME,
  icon: SCRIPT_ICON,
  kind: "Command",
  hint: "Add, edit or remove scripts in Finder",
  run: openScriptsFolder,
};

const listSettingsActions = (itemValue: string): SettingsAction[] => {
  const script = listScripts().find((candidate) => toScriptValue(candidate) === itemValue);
  if (script === undefined) {
    return [];
  }
  return [
    {
      label: "Edit script",
      run: async () => {
        await runCommand("open", ["-t", script.path]);
        return true;
      },
    },
    {
      label: "Show in Finder",
      run: async () => {
        await runCommand("open", ["-R", script.path]);
        return true;
      },
    },
  ];
};

export const scripts: RedhotApp = {
  id: APP_ID,
  listItems: () => [createItem, showAllItem, openFolderItem, ...listScripts().map(toItem)],
  listSettingsActions,
};
