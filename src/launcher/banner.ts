import { styleText } from "node:util";

const LEFT_PADDING = "  ";
const DEFAULT_COLOR = "\u001B[39m";
const PLAIN_NAME_COLOR = 160;

const LOGO_ROWS = ["╦═╗╔═╗╦═╗╦ ╦╔═╗╔╦╗", "╠╦╝║╣ ║ ║╠═╣║ ║ ║ ", "╩╚═╚═╝╩═╝╩ ╩╚═╝ ╩ "];
const LOGO_WIDTH = Math.max(...LOGO_ROWS.map((row) => row.length));
const LETTER_WIDTH = 3;

type Rgb = readonly [red: number, green: number, blue: number];
// A mild red heating up to a hot red, left to right.
const GRADIENT_START: Rgb = [235, 100, 95];
const GRADIENT_END: Rgb = [235, 25, 25];
// One 256-colour red per letter, for terminals without full RGB colour.
const LETTER_COLORS = [210, 203, 203, 196, 196, 196];
const TRUE_COLOR_TERMS = new Set(["truecolor", "24bit"]);

const supportsTrueColor = (): boolean => TRUE_COLOR_TERMS.has(process.env.COLORTERM ?? "");

const toColorCode = (color: number): string => `\u001B[38;5;${color}m`;

const toRgbCode = ([red, green, blue]: Rgb): string => `\u001B[38;2;${red};${green};${blue}m`;

const mixChannel = (from: number, to: number, amount: number): number =>
  Math.round(from + (to - from) * amount);

const mixGradient = (amount: number): Rgb => [
  mixChannel(GRADIENT_START[0], GRADIENT_END[0], amount),
  mixChannel(GRADIENT_START[1], GRADIENT_END[1], amount),
  mixChannel(GRADIENT_START[2], GRADIENT_END[2], amount),
];

/** Every column gets its own colour, so the fade is smooth. */
const paintSmoothGradient = (row: string): string =>
  [...row]
    .map((character, column) => {
      const amount = column / (LOGO_WIDTH - 1);
      return `${toRgbCode(mixGradient(amount))}${character}`;
    })
    .join("");

/** Colours change only between letters, so no letter is split across two colours. */
const paintLetterGradient = (row: string): string => {
  const letters: string[] = [];
  for (let start = 0; start < row.length; start += LETTER_WIDTH) {
    const color = LETTER_COLORS[letters.length] ?? PLAIN_NAME_COLOR;
    letters.push(`${toColorCode(color)}${row.slice(start, start + LETTER_WIDTH)}`);
  }
  return letters.join("");
};

const paintGradient = (row: string, trueColor: boolean): string => {
  const painted = trueColor ? paintSmoothGradient(row) : paintLetterGradient(row);
  return `${LEFT_PADDING}${painted}${DEFAULT_COLOR}`;
};

const paintPlainName = (): string =>
  `${LEFT_PADDING}${toColorCode(PLAIN_NAME_COLOR)}redhot${DEFAULT_COLOR}`;

/** The logo, or the plain name when the window is too narrow for it. */
export const renderBanner = (
  columns: number,
  aside?: string,
  trueColor = supportsTrueColor(),
): string => {
  const fitsWindow = LEFT_PADDING.length + LOGO_WIDTH <= columns;
  const rows = fitsWindow
    ? LOGO_ROWS.map((row) => paintGradient(row, trueColor))
    : [paintPlainName()];
  if (fitsWindow && aside !== undefined) {
    const gap = columns - LEFT_PADDING.length - LOGO_WIDTH - aside.length;
    if (gap >= 4) rows[0] += `${" ".repeat(gap)}${styleText("gray", aside)}`;
  }
  return `\n${rows.join("\n")}\n`;
};
