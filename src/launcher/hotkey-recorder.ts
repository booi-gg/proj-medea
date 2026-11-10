import { styleText } from "node:util";
import { confirm, isCancel, log } from "@clack/prompts";
import { buildRecorder } from "../menubar/helper.ts";
import { writeLog } from "../log.ts";
import { recorderPath } from "../paths.ts";
import { runCommand } from "../shell.ts";
import { formatHotkey, parseRecording } from "./hotkeys.ts";

/**
 * Opens the native recorder window and returns its JSON, or undefined if it was cancelled. A
 * terminal can't do this itself, because macOS and the terminal app take these keys first.
 */
export const recordKeys = async (): Promise<string | undefined> => {
  await buildRecorder();
  try {
    const { stdout } = await runCommand(recorderPath);
    return stdout;
  } catch (error) {
    writeLog("hotkey.record-failed", { error }, { level: "warn" });
    return undefined;
  }
};

/** Either keys that passed every check, or the line to show instead. */
export type RecordedHotkey =
  | { kind: "hotkey"; hotkey: string }
  | { kind: "notice"; notice: string };

const toWarning = (message: string): string => styleText("yellow", message);

const confirmSystemShortcut = async (hotkey: string): Promise<boolean> => {
  const answer = await confirm({
    message: `${formatHotkey(hotkey)} is already a macOS shortcut. Use it anyway?`,
    initialValue: false,
  });
  return !isCancel(answer) && answer;
};

/**
 * Records keys and checks them with findProblem, asking before taking a macOS shortcut. The
 * screen is drawn by the caller, because each one has its own title.
 */
export const recordHotkey = async (
  findProblem: (hotkey: string) => string | undefined,
): Promise<RecordedHotkey> => {
  log.info("Press your hotkey in the Record Hotkey window");
  const output = await recordKeys();
  if (output === undefined) {
    return { kind: "notice", notice: "Hotkey not changed" };
  }
  const recording = parseRecording(output);
  if (recording === undefined) {
    return { kind: "notice", notice: toWarning("That key can't be used for a hotkey") };
  }
  if (recording.kind === "interrupted") {
    return {
      kind: "notice",
      notice: toWarning(
        "Another app took focus while you held the keys, so that shortcut may be in use",
      ),
    };
  }
  const { hotkey, usedBySystem } = recording;
  const problem = findProblem(hotkey);
  if (problem !== undefined) {
    return { kind: "notice", notice: toWarning(`${formatHotkey(hotkey)}: ${problem}`) };
  }
  if (usedBySystem && !(await confirmSystemShortcut(hotkey))) {
    return { kind: "notice", notice: "Hotkey not changed" };
  }
  return { kind: "hotkey", hotkey };
};
