import stringWidth from "string-width";

const ELLIPSIS = "…";
const FALLBACK_COLUMNS = 80;
const FALLBACK_ROWS = 24;
// The focus marker on the left of each row.
const LIST_INDENT = 4;
const DIVIDER_WIDTH = 3;
const LIST_SHARE = 0.38;
const MIN_LIST_WIDTH = 24;
const MAX_LIST_WIDTH = 44;
const MIN_PREVIEW_WIDTH = 24;
// The search bar, footer and spacing around the panes. Split screens leave out the logo.
const SCREEN_CHROME_ROWS = 7;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;

const graphemes = new Intl.Segmenter();

/** Cuts text to this many terminal columns. Wide characters like 日本 take two. */
export const fitToWidth = (text: string, width: number): string => {
  if (stringWidth(text) <= width) {
    return text;
  }
  let fitted = "";
  let used = 0;
  for (const { segment } of graphemes.segment(text)) {
    const segmentWidth = stringWidth(segment);
    if (used + segmentWidth > width - 1) {
      break;
    }
    fitted += segment;
    used += segmentWidth;
  }
  return `${fitted}${ELLIPSIS}`;
};

/** Pads to this many terminal columns. Colour codes don't count towards the width. */
export const padToWidth = (text: string, width: number): string =>
  `${text}${" ".repeat(Math.max(0, width - stringWidth(text)))}`;

export interface SplitLayout {
  listWidth: number;
  previewWidth: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** The sizes of a list beside a preview, or undefined when the window is too narrow for both. */
export const toSplitLayout = (
  columns = FALLBACK_COLUMNS,
  rows = FALLBACK_ROWS,
): SplitLayout | undefined => {
  const listWidth = clamp(Math.floor(columns * LIST_SHARE), MIN_LIST_WIDTH, MAX_LIST_WIDTH);
  const previewWidth = columns - LIST_INDENT - listWidth - DIVIDER_WIDTH - 1;
  if (previewWidth < MIN_PREVIEW_WIDTH) {
    return undefined;
  }
  return {
    listWidth,
    previewWidth,
    height: clamp(rows - SCREEN_CHROME_ROWS, MIN_HEIGHT, MAX_HEIGHT),
  };
};

/** Lines two columns up row by row. Every frame gets the same height, so the screen stays still. */
export const joinColumns = (
  left: readonly string[],
  right: readonly string[],
  { listWidth, height }: SplitLayout,
  divider: string,
): string[] =>
  Array.from(
    { length: height },
    (_unused, row) =>
      `${padToWidth(left[row] ?? "", listWidth + LIST_INDENT)} ${divider} ${right[row] ?? ""}`,
  );
