import { spawn } from "node:child_process";
import { buildImagePreview } from "../../menubar/helper.ts";
import { imagePreviewPath } from "../../paths.ts";

export interface ImageWindow {
  show: (imagePath: string) => void;
  hide: () => void;
  close: () => void;
}

const noWindow: ImageWindow = {
  show: () => {},
  hide: () => {},
  close: () => {},
};

/**
 * Opens the native window that shows the real image. A terminal can only approximate one with
 * characters, and Terminal has no image protocol. If it can't start, previews just aren't shown.
 */
export const openImageWindow = async (): Promise<ImageWindow> => {
  try {
    await buildImagePreview();
  } catch {
    return noWindow;
  }
  const window = spawn(imagePreviewPath, { stdio: ["pipe", "ignore", "ignore"] });
  window.on("error", () => {});
  // The window can close first, and writing to it then must not end Medea.
  window.stdin.on("error", () => {});
  window.unref();

  let current = "";
  const send = (command: string): void => {
    if (command !== current) {
      current = command;
      window.stdin.write(`${command}\n`);
    }
  };

  return {
    show: (imagePath) => send(`show ${imagePath}`),
    hide: () => send("hide"),
    close: () => window.stdin.end(),
  };
};
