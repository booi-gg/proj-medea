import { helperSocketPath } from "../paths.ts";
import { runCommand } from "../shell.ts";
import { sendSocketRequest } from "../socket.ts";

// Longer than the CLI's own socket, because moving a window waits on the app that owns it.
const REQUEST_TIMEOUT_MS = 3000;
const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export type WindowAccess = "granted" | "missing" | "no-helper";

/** Returns the helper's one-line reply, or undefined when it isn't running. */
export const sendHelperRequest = async (request: string): Promise<string | undefined> => {
  const reply = await sendSocketRequest(helperSocketPath, request, REQUEST_TIMEOUT_MS);
  return reply?.trim();
};

/** The helper has to answer this, because the permission belongs to it and not to the CLI. */
export const readWindowAccess = async (): Promise<WindowAccess> => {
  const reply = await sendHelperRequest("access");
  if (reply === undefined) {
    return "no-helper";
  }
  return reply === "granted" ? "granted" : "missing";
};

/** Adds the helper to the list in System Settings, then opens that page. */
export const askForWindowAccess = async (): Promise<void> => {
  await sendHelperRequest("access ask");
  await runCommand("open", [ACCESSIBILITY_SETTINGS_URL]);
};
