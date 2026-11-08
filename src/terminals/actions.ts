import { withAction } from "../log.ts";
import type { LauncherItem } from "../redhot-apps/types.ts";
import { stopMenuBar } from "../menubar/helper.ts";
import { showNotice } from "../menubar/notice.ts";
import { requestWindow } from "./pending-window.ts";
import { focusRunningCli, quitRunningCli, runInRunningCli } from "./running-cli.ts";
import { openRedhotWindow } from "./terminals.ts";

/** Reuses a running CLI window, or opens a new one in Terminal. */
export const showCli = async (): Promise<void> => {
  if (await focusRunningCli()) {
    return;
  }
  await openRedhotWindow();
};

const openItemWindow = async (itemValue: string): Promise<void> => {
  await requestWindow(["run-in-window", itemValue]);
  await openRedhotWindow();
};

/** Opens a window that installs the newest version, so the person can watch it happen. */
export const openUpdateWindow = async (): Promise<void> => {
  await requestWindow(["update-in-window"]);
  await openRedhotWindow();
};

// Loads every Redhot app, so it stays out of commands that never run one.
const findItem = async (itemValue: string | undefined): Promise<LauncherItem | undefined> => {
  const { findRedhotItem } = await import("../redhot-apps/registry.ts");
  return findRedhotItem(itemValue);
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
  // A hotkey has no window to answer in, so its result and any failure show as a notice.
  try {
    const notice = await item.run();
    if (notice !== "") {
      await showNotice({ title: item.name, message: notice });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await showNotice({ title: item.name, message, isError: true });
    throw error;
  }
};

export const runCommandItem = async (itemValue: string | undefined): Promise<void> =>
  withAction("item.run", { item: itemValue }, () => runCommandItemInner(itemValue));
