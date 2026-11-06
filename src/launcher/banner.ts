const LEFT_PADDING = "  ";
const DEFAULT_COLOR = "\u001B[39m";
// 256-colour teal to cyan, left to right. These work without full RGB colour support.
const GRADIENT_COLORS = [30, 37, 44, 51];

const LOGO_ROWS = [
  "╔═╗╦ ╦╔═╗╔═╗╦═╗╔═╗╔═╗╔═╗╔╦╗",
  "╚═╗║ ║╠═╝║╣ ╠╦╝║  ╠═╣╚═╗ ║ ",
  "╚═╝╚═╝╩  ╚═╝╩╚═╚═╝╩ ╩╚═╝ ╩ ",
];
const LOGO_WIDTH = Math.max(...LOGO_ROWS.map((row) => row.length));

const toColorCode = (color: number): string => `\u001B[38;5;${color}m`;

const paintGradient = (row: string): string => {
  const bandWidth = Math.ceil(row.length / GRADIENT_COLORS.length);
  const bands = GRADIENT_COLORS.map((color, index) => {
    const band = row.slice(index * bandWidth, (index + 1) * bandWidth);
    return `${toColorCode(color)}${band}`;
  });
  return `${LEFT_PADDING}${bands.join("")}${DEFAULT_COLOR}`;
};

const paintPlainName = (): string => `${LEFT_PADDING}${toColorCode(44)}supercast${DEFAULT_COLOR}`;

/** The logo, or the plain name when the window is too narrow for it. */
export const renderBanner = (columns: number): string => {
  const fitsWindow = LEFT_PADDING.length + LOGO_WIDTH <= columns;
  const rows = fitsWindow ? LOGO_ROWS.map(paintGradient) : [paintPlainName()];
  return `\n${rows.join("\n")}\n`;
};
