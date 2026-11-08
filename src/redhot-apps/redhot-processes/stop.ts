import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { trackSpawn } from "../../log.ts";
import { isAutomationDenied, runCommand } from "../../shell.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { needsAdmin } from "./list.ts";
import type { RunningItem } from "./list.ts";

export const QUIT = "quit";
export const FORCE_QUIT = "force-quit";
export type StopMode = typeof QUIT | typeof FORCE_QUIT;

const POLITE_SIGNAL = "SIGTERM";
const FORCE_SIGNAL = "SIGKILL";
const ZOMBIE_STATE = "Z";
const SUDO_SIGNAL_NAMES = { [POLITE_SIGNAL]: "TERM", [FORCE_SIGNAL]: "KILL" } as const;
type StopSignal = keyof typeof SUDO_SIGNAL_NAMES;

// The name is an argument, so nothing in it can be read as AppleScript.
const QUIT_SCRIPT = [
  "-e",
  "on run {appName}",
  "-e",
  "tell application appName to quit",
  "-e",
  "end run",
];
// An app asking about unsaved work holds this open for as long as the question is up.
const QUIT_TIMEOUT_MS = 2000;
const EXIT_WAIT_MS = 1500;
const EXIT_POLL_MS = 100;

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

/** A zombie has ended and only waits for its parent to notice, so it doesn't count as running. */
const isRunning = async (pid: number): Promise<boolean> => {
  try {
    const { stdout } = await runCommand("ps", ["-o", "stat=", "-p", String(pid)]);
    const state = stdout.trim();
    return state !== "" && !state.startsWith(ZOMBIE_STATE);
  } catch {
    return false;
  }
};

/** The list can be minutes old, and by now a process ID may belong to something else. */
const isStillSameProcess = async ({ pid, command }: RunningItem): Promise<boolean> => {
  try {
    const { stdout } = await runCommand("ps", ["-o", "comm=", "-p", String(pid)]);
    return stdout.trim() === command;
  } catch {
    return false;
  }
};

/** Resolves to true if the process ended in time. */
const waitForExit = async (pid: number): Promise<boolean> => {
  for (let waited = 0; waited < EXIT_WAIT_MS; waited += EXIT_POLL_MS) {
    if (!(await isRunning(pid))) {
      return true;
    }
    await sleep(EXIT_POLL_MS);
  }
  return !(await isRunning(pid));
};

const signalOwnProcess = (pid: number, signal: StopSignal, name: string): void => {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (!hasCode(error, "ESRCH")) {
      throw new Error(`macOS didn't let Redhot stop ${name}`);
    }
  }
};

const signalWithSudo = async (pid: number, signal: StopSignal, name: string): Promise<void> => {
  // Inherits the terminal, so sudo can ask for the password right here.
  const sudo = trackSpawn(
    spawn("sudo", ["--", "/bin/kill", "-s", SUDO_SIGNAL_NAMES[signal], String(pid)], {
      stdio: "inherit",
    }),
    "sudo",
  );
  const [exitCode] = await once(sudo, "close");
  if (exitCode !== 0) {
    throw new Error(`Couldn't stop ${name} with sudo`);
  }
};

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && "killed" in error && error.killed === true;

/** Resolves to false when the app didn't answer in time, usually because it's asking something. */
const askAppToQuit = async (appName: string, name: string): Promise<boolean> => {
  try {
    await runCommand("osascript", [...QUIT_SCRIPT, appName], { timeout: QUIT_TIMEOUT_MS });
    return true;
  } catch (error) {
    if (isTimeout(error)) {
      return false;
    }
    if (isAutomationDenied(error)) {
      throw new Error(
        `Redhot can't quit ${name} yet. Allow your terminal to control it in System Settings, Privacy & Security, Automation`,
      );
    }
    throw new Error(`${name} didn't accept the request to quit. Try force quit`);
  }
};

const toOutcome = (name: string, mode: StopMode, hasExited: boolean): string => {
  if (hasExited) {
    return mode === QUIT ? `Stopped ${name}` : `Force quit ${name}`;
  }
  return mode === QUIT
    ? `Asked ${name} to quit, but it's still running. It may be waiting for you, or try force quit`
    : `${name} hasn't ended yet`;
};

/** Stops it and resolves to a line saying how that went. Ask first when `needsConfirmation` says so. */
export const stopRunningItem = async (
  item: RunningItem,
  mode: StopMode,
  ownUser?: string,
): Promise<string> => {
  const name = toSafeName(item.name);
  if (!(await isStillSameProcess(item))) {
    throw new Error(`${name} has already ended`);
  }
  const signal = mode === QUIT ? POLITE_SIGNAL : FORCE_SIGNAL;
  if (needsAdmin(item, ownUser)) {
    await signalWithSudo(item.pid, signal, name);
  } else if (mode === QUIT && item.isApp) {
    const answered = await askAppToQuit(item.name, name);
    if (!answered) {
      return toOutcome(name, mode, false);
    }
  } else {
    signalOwnProcess(item.pid, signal, name);
  }
  return toOutcome(name, mode, await waitForExit(item.pid));
};

/** Force quitting loses unsaved work, and stopping someone else's process takes sudo. */
export const needsConfirmation = (item: RunningItem, mode: StopMode, ownUser?: string): boolean =>
  mode === FORCE_QUIT || needsAdmin(item, ownUser);

export const toConfirmationMessage = (
  item: RunningItem,
  mode: StopMode,
  ownUser?: string,
): string => {
  const name = toSafeName(item.name);
  if (!needsAdmin(item, ownUser)) {
    return `Force quit ${name}? Anything unsaved will be lost`;
  }
  return mode === FORCE_QUIT
    ? `Force quit ${name}? It's owned by ${toSafeName(item.user)}, so this uses sudo`
    : `${name} is owned by ${toSafeName(item.user)}. Stop it with sudo?`;
};
