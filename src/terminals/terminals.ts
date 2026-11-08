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
 * Opens a Redhot window from a profile, with no login shell, so nothing shows before Redhot draws.
 * Every window runs the same launcher: what it should show is left in a note (pending-window.ts).
 * Neither route needs permission.
 */
export const openRedhotWindow = async (): Promise<void> => {
  try {
    await openWithTerminal(await writeTerminalProfile(launcherPath));
  } catch (error) {
    writeLog("terminal.open-fallback", { error }, { level: "warn" });
    await openWithTerminal(launcherPath);
  }
};

/** Brings Terminal forward. The CLI has already raised its own window with an escape sequence. */
export const raiseTerminal = (): Promise<void> => openWithTerminal();
