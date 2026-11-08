import { isAutomationDenied } from "../../shell.ts";

export const APP_ID = "redhot-system";

const OK_REPLY = "ok";
const BAD_COMMAND_REPLY = "bad-command";
const LOCK_REQUEST = "lock-screen";
const FINDER = "Finder";
const SYSTEM_EVENTS = "System Events";
const FINDER_DEFAULTS = "com.apple.finder";
const SHOW_ALL_FILES_KEY = "AppleShowAllFiles";
const TURNED_ON = /^(?:1|yes|true)$/iu;
const AUTOMATION_DENIED_MESSAGE =
  "Redhot isn't allowed to do that yet. Allow it in System Settings, Privacy & Security, Automation";

const EMPTY_TRASH_SCRIPT = ["empty trash"];
const TOGGLE_DARK_MODE_SCRIPT = [
  "tell appearance preferences",
  "set dark mode to not dark mode",
  "return dark mode",
  "end tell",
];
// One disk being in use shouldn't stop the others, so each one is ejected on its own.
const EJECT_ALL_SCRIPT = [
  "set ejectedCount to 0",
  "set failedCount to 0",
  "repeat with ejectableDisk in (every disk whose ejectable is true)",
  "try",
  "eject ejectableDisk",
  "set ejectedCount to ejectedCount + 1",
  "on error",
  "set failedCount to failedCount + 1",
  "end try",
  "end repeat",
  'return (ejectedCount as text) & " " & (failedCount as text)',
];

/** What commands run. Passed in so tests can check them without sleeping or restarting the Mac. */
export interface SystemTools {
  run: (file: string, args: readonly string[]) => Promise<{ stdout: string }>;
  askHelper: (request: string) => Promise<string | undefined>;
}

export interface SystemCommand {
  /** Saved aliases and hotkeys use this, so it must not change. */
  id: string;
  name: string;
  symbol: string;
  hint: string;
  /** Asked first, with No selected. Only for commands that close everything that's open. */
  confirmation?: string;
  run: (tools: SystemTools) => Promise<string>;
}

export const toSystemValue = (id: string): string => `${APP_ID}:${id}`;

const runProgram = async (
  { run }: SystemTools,
  failure: string,
  file: string,
  args: readonly string[],
): Promise<string> => {
  try {
    const { stdout } = await run(file, args);
    return stdout.trim();
  } catch (error) {
    throw new Error(isAutomationDenied(error) ? AUTOMATION_DENIED_MESSAGE : failure, {
      cause: error,
    });
  }
};

const tellApp = (
  tools: SystemTools,
  failure: string,
  app: string,
  lines: readonly string[],
): Promise<string> =>
  runProgram(
    tools,
    failure,
    "osascript",
    [`tell application "${app}"`, ...lines, "end tell"].flatMap((line) => ["-e", line]),
  );

const lockScreen = async ({ askHelper }: SystemTools): Promise<string> => {
  const reply = await askHelper(LOCK_REQUEST);
  if (reply === undefined) {
    throw new Error("Lock Screen needs the menu bar item. Use Add Menu Bar Item first");
  }
  if (reply === BAD_COMMAND_REPLY) {
    throw new Error("Lock Screen needs a newer menu bar item. Run redhot restart, then try again");
  }
  if (reply !== OK_REPLY) {
    throw new Error("macOS didn't let Redhot lock the screen");
  }
  return "";
};

const runPowerProgram = async (
  tools: SystemTools,
  failure: string,
  mode: string,
): Promise<string> => {
  await runProgram(tools, failure, "pmset", [mode]);
  return "";
};

const emptyTrash = async (tools: SystemTools): Promise<string> => {
  await tellApp(tools, "The Trash couldn't be emptied", FINDER, EMPTY_TRASH_SCRIPT);
  return "Emptied the Trash";
};

export const toDarkModeMessage = (output: string): string =>
  output === "true" ? "Dark mode on" : "Dark mode off";

const toggleDarkMode = async (tools: SystemTools): Promise<string> =>
  toDarkModeMessage(
    await tellApp(tools, "Dark mode couldn't be changed", SYSTEM_EVENTS, TOGGLE_DARK_MODE_SCRIPT),
  );

/** The setting doesn't exist until something first writes it, and files are hidden until then. */
const areHiddenFilesShown = async ({ run }: SystemTools): Promise<boolean> => {
  try {
    const { stdout } = await run("defaults", ["read", FINDER_DEFAULTS, SHOW_ALL_FILES_KEY]);
    return TURNED_ON.test(stdout.trim());
  } catch {
    return false;
  }
};

const toggleHiddenFiles = async (tools: SystemTools): Promise<string> => {
  const failure = "Hidden files couldn't be changed";
  const shouldShow = !(await areHiddenFilesShown(tools));
  await runProgram(tools, failure, "defaults", [
    "write",
    FINDER_DEFAULTS,
    SHOW_ALL_FILES_KEY,
    "-bool",
    String(shouldShow),
  ]);
  // Finder only reads this when it starts.
  await runProgram(tools, failure, "killall", [FINDER]);
  return shouldShow ? "Showing hidden files" : "Hiding hidden files";
};

const toDiskCount = (count: number): string => `${count} ${count === 1 ? "disk" : "disks"}`;

export const toEjectMessage = (ejected: number, failed: number): string => {
  if (ejected === 0 && failed === 0) {
    return "No disks to eject";
  }
  const stuck = `${toDiskCount(failed)} couldn't be ejected and may be in use`;
  if (ejected === 0) {
    return stuck;
  }
  const done = `Ejected ${toDiskCount(ejected)}`;
  return failed === 0 ? done : `${done}. ${stuck}`;
};

const ejectAllDisks = async (tools: SystemTools): Promise<string> => {
  const output = await tellApp(tools, "The disks couldn't be ejected", FINDER, EJECT_ALL_SCRIPT);
  const [ejected = 0, failed = 0] = output.split(" ").map(Number);
  return toEjectMessage(ejected, failed);
};

const tellSystemEvents = async (
  tools: SystemTools,
  failure: string,
  action: string,
): Promise<string> => {
  await tellApp(tools, failure, SYSTEM_EVENTS, [action]);
  return "";
};

export const SYSTEM_COMMANDS: readonly SystemCommand[] = [
  {
    id: "lock-screen",
    name: "Lock Screen",
    symbol: "⚿",
    hint: "Lock this Mac now",
    run: lockScreen,
  },
  {
    id: "sleep",
    name: "Sleep",
    symbol: "☾",
    hint: "Put this Mac to sleep",
    run: (tools) => runPowerProgram(tools, "This Mac couldn't be put to sleep", "sleepnow"),
  },
  {
    id: "sleep-displays",
    name: "Sleep Displays",
    symbol: "▭",
    hint: "Turn the screens off",
    run: (tools) => runPowerProgram(tools, "The displays couldn't sleep", "displaysleepnow"),
  },
  {
    id: "empty-trash",
    name: "Empty Trash",
    symbol: "⌫",
    hint: "Delete everything in the Trash",
    run: emptyTrash,
  },
  {
    id: "toggle-dark-mode",
    name: "Toggle Dark Mode",
    symbol: "◐",
    hint: "Switch between light and dark",
    run: toggleDarkMode,
  },
  {
    id: "toggle-hidden-files",
    name: "Toggle Hidden Files",
    symbol: "◌",
    hint: "Show or hide them in Finder",
    run: toggleHiddenFiles,
  },
  {
    id: "eject-all-disks",
    name: "Eject All Disks",
    symbol: "▲",
    hint: "Eject every removable disk",
    run: ejectAllDisks,
  },
  {
    id: "restart",
    name: "Restart",
    symbol: "↻",
    hint: "Restart this Mac, after asking",
    confirmation: "Restart this Mac?",
    run: (tools) => tellSystemEvents(tools, "This Mac couldn't restart", "restart"),
  },
  {
    id: "shut-down",
    name: "Shut Down",
    symbol: "⏻",
    hint: "Turn this Mac off, after asking",
    confirmation: "Shut down this Mac?",
    run: (tools) => tellSystemEvents(tools, "This Mac couldn't shut down", "shut down"),
  },
  {
    id: "log-out",
    name: "Log Out",
    symbol: "⇥",
    hint: "End this session, after asking",
    confirmation: "Log out of this Mac?",
    run: (tools) => tellSystemEvents(tools, "Redhot couldn't log you out", "log out"),
  },
];

/** Resolves to the line to show above the search bar. Nothing runs when the question is declined. */
export const runSystemCommand = async (
  command: SystemCommand,
  tools: SystemTools,
  confirmRun: (command: SystemCommand) => Promise<boolean>,
): Promise<string> => {
  if (command.confirmation !== undefined && !(await confirmRun(command))) {
    return "";
  }
  return command.run(tools);
};
