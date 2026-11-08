import { styleText } from "node:util";
import { renderBanner } from "./banner.ts";
import { APP_NAME } from "../paths.ts";
import { readSyncStatusSync } from "../sync/sync.ts";
import type { SyncStatus } from "../sync/sync.ts";
import stringWidth from "string-width";

const EMOJI_STYLE_MARK = "\uFE0F";

/** Columns Terminal moves for this text. It ignores the mark that asks for emoji style. */
export const toTerminalWidth = (text: string): number =>
  stringWidth(text.replaceAll(EMOJI_STYLE_MARK, ""));

export interface ScreenTitle {
  title: string;
  icon?: string | undefined;
}

const CONTROL_CHARACTERS = /\p{Cc}/gu;

const CLEAR_SCREEN_SEQUENCE = "\u001B[2J\u001B[H";
const CLEAR_SCROLLBACK_SEQUENCE = "\u001B[3J";

/**
 * Terminal moves a cleared screen into its scrollback, blank rows included, which would leave a gap
 * above the logo on every redraw. Only a window Redhot opened can lose that: in your own terminal
 * the scrollback is your earlier work.
 */
export const toClearSequence = (isRedhotWindow: boolean): string =>
  isRedhotWindow ? `${CLEAR_SCREEN_SEQUENCE}${CLEAR_SCROLLBACK_SEQUENCE}` : CLEAR_SCREEN_SEQUENCE;

const isRedhotWindow = (): boolean => process.env.REDHOT_WINDOW === "1";

/** The name in the title bar. Item names come from disk, so nothing in them may run. */
export const toWindowTitleSequence = (title: string | undefined): string => {
  const parts = title === undefined ? [APP_NAME] : [APP_NAME, title];
  return `\u001B]0;${parts.join(" — ").replaceAll(CONTROL_CHARACTERS, "")}\u0007`;
};

// Your own terminal's title bar isn't Redhot's to change.
const prepareWindow = (title: string | undefined): string =>
  isRedhotWindow()
    ? `${toClearSequence(true)}${toWindowTitleSequence(title)}`
    : toClearSequence(false);

const renderTitle = ({ title, icon }: ScreenTitle): string => {
  const parts = icon === undefined ? [] : [icon];
  return `  ${[...parts, styleText("bold", title)].join(" ")}\n`;
};

export const formatSyncLabel = (status: SyncStatus, now = Date.now()): string => {
  if (!status.enabled) return "Sync off";
  if (status.paused) return "Sync paused";
  if (status.error) return "Sync issue";
  if (status.lastSyncAt === undefined) return "Sync pending";
  const elapsed = Math.max(0, now - new Date(status.lastSyncAt).getTime());
  if (!Number.isFinite(elapsed)) return "Sync pending";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Last sync just now";
  if (minutes < 60) return `Last sync ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last sync ${hours}h ago`;
  return `Last sync ${Math.floor(hours / 24)}d ago`;
};

/** Clears the window and draws the logo, with what this screen is and an optional line under it. */
export const drawScreen = (screen: Partial<ScreenTitle> & { notice?: string } = {}): void => {
  const { title, icon, notice = "" } = screen;
  const titleLine = title === undefined ? "" : `\n${renderTitle({ title, icon })}`;
  const noticeLine = notice === "" ? "" : `\n  ${notice}\n`;
  const banner = renderBanner(process.stdout.columns, formatSyncLabel(readSyncStatusSync()));
  process.stdout.write(`${prepareWindow(title)}${banner}${titleLine}${noticeLine}`);
};
