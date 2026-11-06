import { styleText } from "node:util";
import { renderBanner } from "./banner.ts";

export interface ScreenTitle {
  title: string;
  icon?: string | undefined;
}

const APP_NAME = "Medea";
const CONTROL_CHARACTERS = /\p{Cc}/gu;

const CLEAR_SCREEN_SEQUENCE = "\u001B[2J\u001B[H";
const CLEAR_SCROLLBACK_SEQUENCE = "\u001B[3J";

/**
 * Terminal moves a cleared screen into its scrollback, blank rows included, which would leave a gap
 * above the logo on every redraw. Only a window Medea opened can lose that: in your own terminal
 * the scrollback is your earlier work.
 */
export const toClearSequence = (isMedeaWindow: boolean): string =>
  isMedeaWindow ? `${CLEAR_SCREEN_SEQUENCE}${CLEAR_SCROLLBACK_SEQUENCE}` : CLEAR_SCREEN_SEQUENCE;

const isMedeaWindow = (): boolean => process.env.MEDEA_WINDOW === "1";

/** The name in the title bar. Item names come from disk, so nothing in them may run. */
export const toWindowTitleSequence = (title: string | undefined): string => {
  const parts = title === undefined ? [APP_NAME] : [APP_NAME, title];
  return `\u001B]0;${parts.join(" — ").replaceAll(CONTROL_CHARACTERS, "")}\u0007`;
};

// Your own terminal's title bar isn't Medea's to change.
const prepareWindow = (title: string | undefined): string =>
  isMedeaWindow()
    ? `${toClearSequence(true)}${toWindowTitleSequence(title)}`
    : toClearSequence(false);

const renderTitle = ({ title, icon }: ScreenTitle): string => {
  const parts = icon === undefined ? [] : [icon];
  return `  ${[...parts, styleText("bold", title)].join(" ")}\n`;
};

/** Clears the window and draws the logo, with what this screen is and an optional line under it. */
export const drawScreen = (screen: Partial<ScreenTitle> & { notice?: string } = {}): void => {
  const { title, icon, notice = "" } = screen;
  const titleLine = title === undefined ? "" : `\n${renderTitle({ title, icon })}`;
  const noticeLine = notice === "" ? "" : `\n  ${notice}\n`;
  const banner = renderBanner(process.stdout.columns);
  process.stdout.write(`${prepareWindow(title)}${banner}${titleLine}${noticeLine}`);
};
