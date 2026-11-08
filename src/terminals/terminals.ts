import { writeLog } from "../log.ts";
import { launcherPath } from "../paths.ts";
import { runCommand } from "../shell.ts";
import { writeTerminalProfile } from "./terminal-profile.ts";

// Redhot opens only in macOS's own Terminal. Other terminals each start programs differently
// and would need their own tested recipe.
const openWithTerminal = async (path?: string): Promise<void> => {
  await runCommand("open", ["-a", "Terminal", ...(path === undefined ? [] : [path])]);
};

/**
 * Opens a script in a new Terminal window. The search window opens from a profile, with no login
 * shell, so nothing shows before Redhot draws. Item windows each run their own script, and a
 * profile's command must stay the same or Terminal saves a copy of it, so those open the .command
 * file. Neither needs permission.
 */
export const openTerminalWindow = async (scriptPath: string): Promise<void> => {
  if (scriptPath !== launcherPath) {
    await openWithTerminal(scriptPath);
    return;
  }
  try {
    await openWithTerminal(await writeTerminalProfile(scriptPath));
  } catch (error) {
    writeLog("terminal.open-fallback", { error }, { level: "warn" });
    await openWithTerminal(scriptPath);
  }
};

/** Brings Terminal forward. The CLI has already raised its own window with an escape sequence. */
export const raiseTerminal = (): Promise<void> => openWithTerminal();
