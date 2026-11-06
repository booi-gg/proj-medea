import { log, spinner } from "@clack/prompts";
import { isMenuBarRunning, startMenuBar, stopMenuBar } from "./helper.ts";
import { refreshLoginItem } from "./login-item.ts";

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

export const stop = async (): Promise<void> => {
  await stopMenuBar();
  log.success("Menu bar item stopped");
};

export const showStatus = async (): Promise<void> => {
  const running = await isMenuBarRunning();
  log.info(`Menu bar item is ${running ? "running" : "stopped"}`);
};
