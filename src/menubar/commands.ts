import { log, spinner } from "@clack/prompts";
import { isMenuBarRunning, restartMenuBar, startMenuBar, stopMenuBar } from "./helper.ts";
import { refreshLoginItem } from "./login-item.ts";
import { setUpSigning, signHelper } from "./signing.ts";

export const start = async (): Promise<void> => {
  const progress = spinner();
  progress.start("Starting the menu bar item");
  try {
    await startMenuBar();
    await refreshLoginItem();
    progress.stop("Menu bar item is running");
  } catch (error) {
    progress.stop("Could not start the menu bar item");
    throw error;
  }
};

/** Picks up a new version: start alone leaves an already running helper as it is. */
export const restart = async (): Promise<void> => {
  const progress = spinner();
  progress.start("Restarting the menu bar item");
  try {
    await restartMenuBar();
    await refreshLoginItem();
    progress.stop("Menu bar item is running");
  } catch (error) {
    progress.stop("Could not restart the menu bar item");
    throw error;
  }
};

export const stop = async (): Promise<void> => {
  await stopMenuBar();
  log.success("Menu bar item stopped");
};

/** Keeps the Accessibility permission across rebuilds. It adds a certificate to the keychain. */
export const sign = async (): Promise<void> => {
  await setUpSigning();
  await signHelper();
  log.success("Signed. Run menubar:stop then menubar:start, and allow redhot-status once more");
};

export const showStatus = async (): Promise<void> => {
  const running = await isMenuBarRunning();
  log.info(`Menu bar item is ${running ? "running" : "stopped"}`);
};
