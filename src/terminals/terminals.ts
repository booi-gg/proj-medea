import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { listApps } from "../launcher/apps.ts";
import { quoteForShell, runCommand } from "../shell.ts";

const configPath = join(homedir(), ".config", "medea", "config.json");

// Ghostty keeps a window open after a "command" exits, leaving an empty window behind. So this
// opens a normal shell and replaces it with exec: when the CLI exits, the window closes.
const OPEN_IN_GHOSTTY_SCRIPT = `on run argv
  tell application "Ghostty"
    set windowConfiguration to new surface configuration
    set initial input of windowConfiguration to item 1 of argv & linefeed
    new window with configuration windowConfiguration
    activate
  end tell
end run`;

// The tty is read before the tell block because Ghostty can't evaluate argv in a whose clause.
const FOCUS_IN_GHOSTTY_SCRIPT = `on run argv
  set ttyPath to item 1 of argv
  tell application "Ghostty"
    focus (first terminal whose tty is ttyPath)
    activate
  end tell
end run`;

const openWithApp = async (appName: string, ...paths: string[]): Promise<void> => {
  await runCommand("open", ["-a", appName, ...paths]);
};

interface TerminalLauncher {
  open: (launcherPath: string) => Promise<void>;
  focus: (ttyPath: string) => Promise<void>;
}

// Every terminal starts programs differently, so each one needs a tested recipe here.
const launchers = {
  Terminal: {
    // Terminal runs .command files directly, with no permission prompt.
    open: (launcherPath) => openWithApp("Terminal", launcherPath),
    // The CLI has already raised its own window with an escape sequence.
    focus: () => openWithApp("Terminal"),
  },
  Ghostty: {
    // Ghostty asks before running a file on every launch, so AppleScript is preferred.
    // It needs Automation permission once. Without it, fall back to the file route.
    open: async (launcherPath) => {
      try {
        const shellInput = ` exec ${quoteForShell(launcherPath)}`;
        await runCommand("osascript", ["-e", OPEN_IN_GHOSTTY_SCRIPT, shellInput]);
      } catch {
        await openWithApp("Ghostty", launcherPath);
      }
    },
    focus: async (ttyPath) => {
      try {
        await runCommand("osascript", ["-e", FOCUS_IN_GHOSTTY_SCRIPT, ttyPath]);
      } catch {
        await openWithApp("Ghostty");
      }
    },
  },
} as const satisfies Record<string, TerminalLauncher>;

type TerminalName = keyof typeof launchers;

const DEFAULT_TERMINAL: TerminalName = "Terminal";

const isTerminalName = (value: unknown): value is TerminalName =>
  typeof value === "string" && Object.hasOwn(launchers, value);

/** Reads the saved terminal from config text, falling back to the default. */
export const parseSavedTerminal = (configText: string): TerminalName => {
  try {
    const config: unknown = JSON.parse(configText);
    const saved = typeof config === "object" && config !== null && "terminal" in config;
    return saved && isTerminalName(config.terminal) ? config.terminal : DEFAULT_TERMINAL;
  } catch {
    return DEFAULT_TERMINAL;
  }
};

const readSavedTerminal = async (): Promise<TerminalName> => {
  try {
    return parseSavedTerminal(await readFile(configPath, "utf8"));
  } catch {
    return DEFAULT_TERMINAL;
  }
};

export const getSelectedLauncher = async (): Promise<TerminalLauncher> =>
  launchers[await readSavedTerminal()];

export interface TerminalChoice {
  name: string;
  selected: boolean;
}

/** The supported terminals that are installed on this Mac. */
export const listTerminals = async (): Promise<TerminalChoice[]> => {
  const [apps, selectedName] = await Promise.all([listApps(), readSavedTerminal()]);
  return apps
    .filter(({ name }) => isTerminalName(name))
    .map(({ name }) => ({ name, selected: name === selectedName }));
};

/** Saves the choice. Returns false when it was already selected. */
export const saveTerminal = async (name: string | undefined): Promise<boolean> => {
  if (!isTerminalName(name)) {
    throw new Error(`Unsupported terminal "${name}". Use ${Object.keys(launchers).join(" or ")}.`);
  }
  if (name === (await readSavedTerminal())) {
    return false;
  }
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({ terminal: name }, null, 2)}\n`);
  return true;
};
