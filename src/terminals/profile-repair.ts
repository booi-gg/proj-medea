import { withAction, writeLog } from "../log.ts";
import { getOwnTtyPath, runCommand } from "../shell.ts";
import { PROFILE_NAME } from "./terminal-profile.ts";

const TERMINAL_APP_PROGRAM = "Apple_Terminal";
const COPY_NUMBER = /^\d+$/u;

// Some windows Terminal keeps after closing them have no tabs, so each one is read on its own.
const READ_PROFILES_SCRIPT = `on run argv
  set ttyPath to item 1 of argv
  -- Inside the tell block, "tab" means a Terminal tab, so the separator is set out here.
  set separator to character id 9
  set out to {}
  tell application "Terminal"
    set end of out to "default" & separator & (name of default settings)
    repeat with profile in settings sets
      set end of out to "profile" & separator & (name of profile)
    end repeat
    repeat with candidate in windows
      try
        repeat with candidateTab in tabs of candidate
          set profileName to name of current settings of candidateTab
          set end of out to "used" & separator & profileName
          if tty of candidateTab is ttyPath then set end of out to "own" & separator & profileName
        end repeat
      end try
    end repeat
  end tell
  set AppleScript's text item delimiters to linefeed
  return out as text
end run`;

const APPLY_REPAIR_SCRIPT = `on run argv
  set baseName to item 1 of argv
  set ownName to item 2 of argv
  tell application "Terminal"
    repeat with index from 3 to count of argv
      try
        delete settings set (item index of argv)
      end try
    end repeat
    if ownName is not "" then set name of settings set ownName to baseName
  end tell
end run`;

export interface ProfileState {
  defaultName: string;
  names: string[];
  inUse: string[];
  ownName?: string;
}

export interface ProfileRepair {
  remove: string[];
  renameOwn: boolean;
}

export const parseProfileState = (output: string): ProfileState => {
  const state: ProfileState = { defaultName: "", names: [], inUse: [] };
  for (const line of output.split("\n")) {
    const [kind = "", ...rest] = line.split("\t");
    const name = rest.join("\t");
    if (kind === "default") state.defaultName = name;
    if (kind === "profile") state.names.push(name);
    if (kind === "used") state.inUse.push(name);
    if (kind === "own") state.ownName = name;
  }
  return state;
};

const isNumberedCopy = (name: string, baseName: string): boolean =>
  name.startsWith(`${baseName} `) && COPY_NUMBER.test(name.slice(baseName.length + 1));

/**
 * Terminal compares an opened profile only with the saved profile of the same name, and saves a
 * numbered copy when they differ. Once the saved one is out of date, after an upgrade or a change
 * to the default profile, every window would add another copy. So a window on a copy takes the
 * name over, and copies nothing uses go. A profile in use or set as the default is never touched.
 */
export const planProfileRepair = (baseName: string, state: ProfileState): ProfileRepair => {
  const { ownName, defaultName, names, inUse } = state;
  const isOwnCopy = ownName !== undefined && isNumberedCopy(ownName, baseName);
  if (ownName !== baseName && !isOwnCopy) {
    return { remove: [], renameOwn: false };
  }
  const isRemovable = (name: string): boolean =>
    name !== ownName && name !== defaultName && !inUse.includes(name);
  const unusedCopies = names.filter((name) => isNumberedCopy(name, baseName) && isRemovable(name));
  if (!isOwnCopy) {
    return { remove: unusedCopies, renameOwn: false };
  }
  const hasBase = names.includes(baseName);
  const canTakeName = !hasBase || isRemovable(baseName);
  return {
    remove: hasBase && canTakeName ? [baseName, ...unusedCopies] : unusedCopies,
    renameOwn: canTakeName,
  };
};

const canRepair = (): boolean =>
  process.env.TERM_PROGRAM === TERMINAL_APP_PROGRAM && process.env.REDHOT_WINDOW === "1";

/** Tidies Terminal's Redhot profiles from inside a Redhot window. Never throws. */
export const repairTerminalProfiles = async (): Promise<void> => {
  if (!canRepair()) {
    return;
  }
  try {
    const ttyPath = await getOwnTtyPath();
    const { stdout } = await runCommand("osascript", ["-e", READ_PROFILES_SCRIPT, ttyPath]);
    const state = parseProfileState(stdout.trim());
    const repair = planProfileRepair(PROFILE_NAME, state);
    if (repair.remove.length === 0 && !repair.renameOwn) {
      return;
    }
    const ownName = repair.renameOwn ? (state.ownName ?? "") : "";
    await withAction("terminal.profile-repair", { count: repair.remove.length }, async () => {
      await runCommand("osascript", [
        "-e",
        APPLY_REPAIR_SCRIPT,
        PROFILE_NAME,
        ownName,
        ...repair.remove,
      ]);
    });
  } catch (error) {
    // Only tidying failed. The window works either way.
    writeLog("terminal.profile-repair-failed", { error }, { level: "warn" });
  }
};
