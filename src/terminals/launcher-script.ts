import { chmod, writeFile } from "node:fs/promises";
import { cliEntryPath, projectDir } from "../paths.ts";
import { quoteForShell } from "../shell.ts";

/** Writes a script a terminal can open to run the CLI with these arguments. */
export const writeLauncherScript = async (
  scriptPath: string,
  cliArguments: readonly string[] = [],
): Promise<void> => {
  // The absolute Node path keeps this working when a terminal's PATH differs from this shell's.
  const command = [process.execPath, cliEntryPath, ...cliArguments].map(quoteForShell).join(" ");
  const script = [
    "#!/bin/zsh",
    // Marks the window as Medea's, so Medea may close it.
    "export MEDEA_WINDOW=1",
    `cd ${quoteForShell(projectDir)}`,
    `exec ${command}`,
    "",
  ];
  await writeFile(scriptPath, script.join("\n"));
  await chmod(scriptPath, 0o755);
};
