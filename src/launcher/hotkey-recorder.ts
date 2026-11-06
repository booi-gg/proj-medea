import { buildRecorder } from "../menubar/helper.ts";
import { recorderPath } from "../paths.ts";
import { runCommand } from "../shell.ts";

/**
 * Opens the native recorder window and returns its JSON, or undefined if it was cancelled. A
 * terminal can't do this itself, because macOS and the terminal app take these keys first.
 */
export const recordKeys = async (): Promise<string | undefined> => {
  await buildRecorder();
  try {
    const { stdout } = await runCommand(recorderPath);
    return stdout;
  } catch {
    return undefined;
  }
};
