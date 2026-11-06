import { launcherPath } from "../paths.ts";
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
