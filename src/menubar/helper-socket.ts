import { helperSocketPath } from "../paths.ts";
import { currentTrace } from "../log.ts";
import { runCommand } from "../shell.ts";
import { sendSocketRequest } from "../socket.ts";

// Longer than the CLI's own socket, because moving a window waits on the app that owns it.
const REQUEST_TIMEOUT_MS = 3000;
const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

export type WindowAccess = "granted" | "missing" | "no-helper";

/** Returns the helper's one-line reply, or undefined when it isn't running. */
export const sendHelperRequest = async (request: string): Promise<string | undefined> => {
  const tracedReply = await sendSocketRequest(
    helperSocketPath,
    `trace ${currentTrace()} ${request}`,
    REQUEST_TIMEOUT_MS,
  );
  const reply = tracedReply?.trim();
  if (reply === "bad-command") {
    // An older helper may still be running until its next restart.
    return (await sendSocketRequest(helperSocketPath, request, REQUEST_TIMEOUT_MS))?.trim();
  }
  return reply;
};

/** Makes the running helper read the saved snippets again, so a change works straight away. */
export const reloadSnippets = async (): Promise<void> => {
  await sendHelperRequest("snippets reload");
};

export type PasteResult = "pasted" | "no-access" | "no-app" | "no-helper";

/**
 * Sends what's on the clipboard to the app used before Redhot's window. An older helper doesn't
 * know this request, so it counts the same as none running.
 */
export const pasteIntoPreviousApp = async (): Promise<PasteResult> => {
  const reply = await sendHelperRequest("paste-previous-app");
  if (reply === "ok") {
    return "pasted";
  }
  return reply === "no-access" || reply === "no-app" ? reply : "no-helper";
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
