const LEFT_PADDING = "  ";
// 256-colour teal, which works in terminals without full RGB colour support.
const TEAL = "\u001B[38;5;37m";
const DEFAULT_COLOR = "\u001B[39m";

const LOGO_ROWS = [
  "███████╗██╗   ██╗██████╗ ███████╗██████╗  ██████╗ █████╗ ███████╗████████╗",
  "██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗██╔════╝██╔══██╗██╔════╝╚══██╔══╝",
  "███████╗██║   ██║██████╔╝█████╗  ██████╔╝██║     ███████║███████╗   ██║   ",
  "╚════██║██║   ██║██╔═══╝ ██╔══╝  ██╔══██╗██║     ██╔══██║╚════██║   ██║   ",
  "███████║╚██████╔╝██║     ███████╗██║  ██║╚██████╗██║  ██║███████║   ██║   ",
  "╚══════╝ ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝   ",
];
const LOGO_WIDTH = Math.max(...LOGO_ROWS.map((row) => row.length));

const paint = (text: string): string => `${LEFT_PADDING}${TEAL}${text}${DEFAULT_COLOR}`;

/** The block logo, or the plain name when the window is too narrow for it. */
export const renderBanner = (columns: number): string => {
  const fitsWindow = LEFT_PADDING.length + LOGO_WIDTH <= columns;
  const rows = fitsWindow ? LOGO_ROWS : ["supercast"];
  return `\n${rows.map(paint).join("\n")}\n`;
};
