import { createHash } from "node:crypto";
import { join } from "node:path";
import { withAction } from "../log.ts";
import type { LauncherItem } from "../medea-apps/types.ts";
import { stopMenuBar } from "../menubar/helper.ts";
import { buildDir, launcherPath } from "../paths.ts";
import { writeLauncherScript } from "./launcher-script.ts";
import { focusRunningCli, quitRunningCli, runInRunningCli } from "./running-cli.ts";
import { getSelectedLauncher, saveTerminal } from "./terminals.ts";

/** Reuses a running CLI window, or opens a new one in the chosen terminal. */
export const showCli = async (): Promise<void> => {
  if (await focusRunningCli()) {
    return;
  }
  const launcher = await getSelectedLauncher();
  await launcher.open(launcherPath);
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

// Loads every Medea app, so it stays out of commands that never run one.
const findItem = async (itemValue: string | undefined): Promise<LauncherItem | undefined> => {
  const { findMedeaItem } = await import("../medea-apps/registry.ts");
  return findMedeaItem(itemValue);
};

/** Runs an item from its hotkey, with no search window involved. */
const runCommandItemInner = async (itemValue: string | undefined): Promise<void> => {
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
  const item = await findItem(itemValue);
  if (item === undefined) {
    throw new Error(`Unknown command "${itemValue}".`);
  }
  if (item.needsWindow === true) {
    if (!(await runInRunningCli(item.value))) {
      await openItemWindow(item.value);
    }
    return;
  }
  await item.run();
};

export const runCommandItem = async (itemValue: string | undefined): Promise<void> =>
  withAction("item.run", { item: itemValue }, () => runCommandItemInner(itemValue));
