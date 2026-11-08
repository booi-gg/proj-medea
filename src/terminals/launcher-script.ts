import { chmod, writeFile } from "node:fs/promises";
import { cliEntryPath, projectDir } from "../paths.ts";
import { quoteForShell } from "../shell.ts";

// Terminals type the launch command into a shell, so it is on screen before the CLI starts.
// Clears the screen, then the scrollback, so it can't be scrolled back to either.
const CLEAR_WINDOW = String.raw`printf '\033[H\033[2J\033[3J'`;

/** Writes the script every Redhot window starts. */
export const writeLauncherScript = async (scriptPath: string): Promise<void> => {
  // The absolute Node path keeps this working when a terminal's PATH differs from this shell's.
  const command = [process.execPath, cliEntryPath].map(quoteForShell).join(" ");
  const script = [
    "#!/bin/zsh",
    CLEAR_WINDOW,
    // Marks the window as Redhot's, so Redhot may close it.
    "export REDHOT_WINDOW=1",
    `cd ${quoteForShell(projectDir)}`,
    `exec ${command}`,
    "",
  ];
  await writeFile(scriptPath, script.join("\n"));
  await chmod(scriptPath, 0o755);
};
