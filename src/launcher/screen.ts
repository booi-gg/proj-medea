import { renderBanner } from "./banner.ts";

const CLEAR_SCREEN_SEQUENCE = "\u001B[2J\u001B[H";
const CLEAR_SCROLLBACK_SEQUENCE = "\u001B[3J";

/**
 * Terminal moves a cleared screen into its scrollback, blank rows included, which would leave a gap
 * above the logo on every redraw. Only a window Medea opened can lose that: in your own terminal
 * the scrollback is your earlier work.
 */
export const toClearSequence = (isMedeaWindow: boolean): string =>
  isMedeaWindow ? `${CLEAR_SCREEN_SEQUENCE}${CLEAR_SCROLLBACK_SEQUENCE}` : CLEAR_SCREEN_SEQUENCE;

const clearSequence = (): string => toClearSequence(process.env.MEDEA_WINDOW === "1");

/** Clears the window for a screen that needs every row. */
export const clearScreen = (): void => {
  process.stdout.write(clearSequence());
};

/** Clears the window and draws the logo, with an optional line under it. */
export const drawScreen = (notice = ""): void => {
  const noticeLine = notice === "" ? "" : `\n  ${notice}\n`;
  process.stdout.write(`${clearSequence()}${renderBanner(process.stdout.columns)}${noticeLine}`);
};
