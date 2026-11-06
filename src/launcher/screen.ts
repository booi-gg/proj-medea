import { renderBanner } from "./banner.ts";

const CLEAR_SCREEN_SEQUENCE = "\u001B[2J\u001B[H";

/** Clears the window for a screen that needs every row. */
export const clearScreen = (): void => {
  process.stdout.write(CLEAR_SCREEN_SEQUENCE);
};

/** Clears the window and draws the logo, with an optional line under it. */
export const drawScreen = (notice = ""): void => {
  const noticeLine = notice === "" ? "" : `\n  ${notice}\n`;
  process.stdout.write(
    `${CLEAR_SCREEN_SEQUENCE}${renderBanner(process.stdout.columns)}${noticeLine}`,
  );
};
