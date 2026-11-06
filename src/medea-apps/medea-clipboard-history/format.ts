import { styleText } from "node:util";
import { fitToWidth } from "../../launcher/split-view.ts";

const WHITESPACE = /\s+/g;
const LINE_BREAK = /\r\n|\r|\n/;
const TAB = /\t/g;
const TAB_SPACES = "    ";
// Copied text can hold escape codes, which would otherwise run in this terminal.
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Fits copied text on one safe line. */
export const toPreview = (text: string, width: number): string =>
  fitToWidth(text.replaceAll(WHITESPACE, " ").replaceAll(CONTROL_CHARACTERS, "").trim(), width);

/** Shows text as it was copied, keeping its lines and indentation, cut to fit the pane. */
export const toPreviewLines = (text: string, width: number, height: number): string[] => {
  const lines = text.trimEnd().split(LINE_BREAK);
  const toSafeLine = (line: string): string =>
    fitToWidth(line.replaceAll(TAB, TAB_SPACES).replaceAll(CONTROL_CHARACTERS, ""), width);
  if (lines.length <= height) {
    return lines.map(toSafeLine);
  }
  const hiddenLines = lines.length - height + 1;
  const more = styleText("dim", `… ${hiddenLines} more lines`);
  return [...lines.slice(0, height - 1).map(toSafeLine), more];
};

export const formatSize = (bytes: number): string =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;

export const formatAge = (copiedAt: number, now: number): string => {
  const age = now - copiedAt;
  if (age < MINUTE_MS) {
    return "now";
  }
  if (age < HOUR_MS) {
    return `${Math.floor(age / MINUTE_MS)}m`;
  }
  if (age < DAY_MS) {
    return `${Math.floor(age / HOUR_MS)}h`;
  }
  return `${Math.floor(age / DAY_MS)}d`;
};
