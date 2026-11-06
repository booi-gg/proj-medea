import { createHash } from "node:crypto";
import { join } from "node:path";
import { buildDir, launcherPath } from "../paths.ts";
import { writeLauncherScript } from "./launcher-script.ts";
import { focusRunningCli, quitRunningCli } from "./running-cli.ts";
import { getSelectedLauncher, saveTerminal } from "./terminals.ts";

/** Reuses a running CLI window, or opens a new one in the chosen terminal. */
export const showCli = async (): Promise<void> => {
  const launcher = await getSelectedLauncher();
  const runningTtyPath = await focusRunningCli();
  if (runningTtyPath === undefined) {
    await launcher.open(launcherPath);
    return;
  }
  await launcher.focus(runningTtyPath);
};

// The open CLI lives in the old terminal, so it quits and the next open uses the new one.
export const setTerminal = async (name: string | undefined): Promise<void> => {
  const changed = await saveTerminal(name);
  if (changed) {
    await quitRunningCli();
  }
};

// One script per item, so two quick requests can't open the wrong item's settings.
const getSettingsScriptPath = (itemValue: string): string => {
  const itemHash = createHash("sha1").update(itemValue).digest("hex").slice(0, 12);
  return join(buildDir, `settings-${itemHash}.command`);
};

/** Opens an item's settings in a new window, leaving the search window where it is. */
export const openItemSettings = async (itemValue: string, itemName: string): Promise<void> => {
  const scriptPath = getSettingsScriptPath(itemValue);
  await writeLauncherScript(scriptPath, ["settings", itemValue, itemName]);
  const launcher = await getSelectedLauncher();
  await launcher.open(scriptPath);
};
