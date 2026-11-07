import { styleText } from "node:util";
import wrapAnsi from "wrap-ansi";
import { fitToWidth } from "../../launcher/split-view.ts";

const WHITESPACE = /\s+/g;
const LINE_BREAK = /\r\n|\r|\n/;
const TAB = /\t/g;
const TAB_SPACES = "    ";
// Copied text can hold escape codes, which would otherwise run in this terminal.
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const UNSAFE_CHARACTERS = /[^\P{Cc}\n\t]/gu;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Fits copied text on one safe line. */
export const toPreview = (text: string, width: number): string =>
  fitToWidth(text.replaceAll(WHITESPACE, " ").replaceAll(CONTROL_CHARACTERS, "").trim(), width);

/** Keeps a whole text's shape, without anything that could run in the terminal. */
export const toSafeText = (text: string): string =>
  text.split(LINE_BREAK).join("\n").replaceAll(UNSAFE_CHARACTERS, "");

type Colorize = (text: string) => string;

// Colours go on after wrapping, because a break could land inside a colour code.
const colorizeLines = (lines: readonly string[], colorize: Colorize): string[] => {
  const colored = colorize(lines.join("\n")).split("\n");
  return colored.length === lines.length ? colored : [...lines];
};

/** Breaks a long line to fit the pane, keeping its indentation. */
const wrapLine = (line: string, width: number): string[] => {
  const clean = line.replaceAll(TAB, TAB_SPACES).replaceAll(CONTROL_CHARACTERS, "");
  const wrapped = wrapAnsi(clean, width, { hard: true, trim: false }).split("\n");
  const [first = "", ...rest] = wrapped;
  // Only the first part keeps its indentation. A word that fills a line leaves its space alone on
  // the next one, which isn't a blank line in the text.
  const continuation = rest.map((part) => part.trim()).filter((part) => part !== "");
  return [first.trimEnd(), ...continuation].map((part) => fitToWidth(part, width));
};

/** Shows text as it was copied, keeping its lines and indentation, wrapped to fit the pane. */
export const toPreviewLines = (
  text: string,
  width: number,
  height: number,
  colorize: Colorize = (plain) => plain,
): string[] => {
  const lines = text
    .trimEnd()
    .split(LINE_BREAK)
    .flatMap((line) => wrapLine(line, width));
  if (lines.length <= height) {
    return colorizeLines(lines, colorize);
  }
  const hiddenLines = lines.length - height + 1;
  const more = styleText("dim", `… ${hiddenLines} more lines`);
  return [...colorizeLines(lines.slice(0, height - 1), colorize), more];
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
