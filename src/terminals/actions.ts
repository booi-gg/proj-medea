import { createHash } from "node:crypto";
import { join } from "node:path";
import { findMedeaItem } from "../medea-apps/registry.ts";
import { stopMenuBar } from "../menubar/helper.ts";
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

// One script per item, so two quick requests can't open the wrong item.
const openItemWindow = async (itemValue: string): Promise<void> => {
  const itemHash = createHash("sha1").update(itemValue).digest("hex").slice(0, 12);
  const scriptPath = join(buildDir, `run-${itemHash}.command`);
  await writeLauncherScript(scriptPath, ["run-in-window", itemValue]);
  const launcher = await getSelectedLauncher();
  await launcher.open(scriptPath);
};

/** Runs an item that a hotkey opened a window for. */
export const runItemInWindow = async (itemValue: string | undefined): Promise<void> => {
  const item = findMedeaItem(itemValue);
  if (item === undefined) {
    throw new Error(`Unknown item "${itemValue}".`);
  }
  await item.run();
};

/** Runs an item from its hotkey, with no search window involved. */
export const runCommandItem = async (itemValue: string | undefined): Promise<void> => {
  if (itemValue === "command:exit") {
    await quitRunningCli();
    return;
  }
  if (itemValue === "command:menu-bar") {
    await stopMenuBar();
    return;
  }
  if (itemValue === "command:set-alias" || itemValue === "command:create-hotkey") {
    await showCli();
    return;
  }
  const item = findMedeaItem(itemValue);
  if (item === undefined) {
    throw new Error(`Unknown command "${itemValue}".`);
  }
  if (item.needsWindow === true) {
    await openItemWindow(item.value);
    return;
  }
  await item.run();
};
