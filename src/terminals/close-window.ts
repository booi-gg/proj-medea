import { spawn } from "node:child_process";
import { isCancel, select } from "@clack/prompts";
import { getOwnTtyPath, runCommand } from "../shell.ts";

const TERMINAL_APP_PROGRAM = "Apple_Terminal";

// Terminal reuses tty names and dead windows keep them, so only a busy tab can be this window.
const FIND_WINDOW_SCRIPT = `on run argv
  set ttyPath to item 1 of argv
  tell application "Terminal"
    repeat with candidate in windows
      repeat with candidateTab in tabs of candidate
        if tty of candidateTab is ttyPath and busy of candidateTab and (count of tabs of candidate) is 1 then return id of candidate
      end repeat
    end repeat
  end tell
  return ""
end run`;

// Waits for Medea to exit first: closing a window with Node running would ask for confirmation.
const CLOSE_WINDOW_SCRIPT = `on run argv
  set windowId to (item 1 of argv) as integer
  delay 0.6
  tell application "Terminal" to close (first window whose id is windowId)
end run`;

/**
 * Terminal keeps a dead window open after a program exits, and Ghostty closes its own. Windows
 * Medea didn't open are left alone, so "pnpm start" can't close the window you ran it from.
 */
const canCloseOwnWindow = (): boolean =>
  process.env.TERM_PROGRAM === TERMINAL_APP_PROGRAM && process.env.MEDEA_WINDOW === "1";

/** Closes this window just after Medea exits. If that isn't allowed, the window stays open. */
export const closeOwnWindow = async (): Promise<void> => {
  if (!canCloseOwnWindow()) {
    return;
  }
  try {
    const ttyPath = await getOwnTtyPath();
    const { stdout } = await runCommand("osascript", ["-e", FIND_WINDOW_SCRIPT, ttyPath]);
    const windowId = stdout.trim();
    if (windowId !== "") {
      spawn("osascript", ["-e", CLOSE_WINDOW_SCRIPT, windowId], {
        detached: true,
        stdio: "ignore",
      }).unref();
    }
  } catch {
    // Only the tidy-up failed, and nothing is lost if the window stays open.
  }
};

export const offerToCloseWindow = async (): Promise<void> => {
  if (!canCloseOwnWindow()) {
    return;
  }
  const choice = await select({
    message: "Finished",
    options: [{ value: "close", label: "Close terminal" }],
  });
  if (!isCancel(choice)) {
    await closeOwnWindow();
  }
};
