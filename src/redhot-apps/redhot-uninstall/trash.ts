import { existsSync } from "node:fs";
import { runCommand } from "../../shell.ts";

// macOS has this from version 15. Its manual gives -s as the way to get an error back.
const TRASH_TOOL = "/usr/bin/trash";
const TRASH_TOOL_ARGUMENTS = ["-s"];
// The path is an argument, so nothing in it can be read as AppleScript.
const FINDER_TRASH_SCRIPT = [
  "-e",
  "on run {itemPath}",
  "-e",
  'tell application "Finder" to delete (POSIX file itemPath as alias)',
  "-e",
  "end run",
];

export const toTrashCommand = (
  path: string,
  hasTrashTool: boolean,
): { file: string; args: string[] } =>
  hasTrashTool
    ? { file: TRASH_TOOL, args: [...TRASH_TOOL_ARGUMENTS, path] }
    : { file: "osascript", args: [...FINDER_TRASH_SCRIPT, path] };

/** Always the Trash, so anything moved here can be put back. */
export const moveToTrash = async (path: string): Promise<void> => {
  const { file, args } = toTrashCommand(path, existsSync(TRASH_TOOL));
  await runCommand(file, args);
};
