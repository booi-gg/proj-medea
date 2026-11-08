import { styleText } from "node:util";
import { supportsTrueColor } from "../../launcher/banner.ts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { ExtraKey, LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { copyText } from "../../shell.ts";
import { fromHex, toFormats, toHex, toHslText, toRgbText, toSwatch } from "./colour.ts";
import type { Rgb } from "./colour.ts";

const FOOTER = "↵ copy";
const LIST_FOOTER = "↵ choose format";
const CTRL_P = "\u0010";
const PICK_AGAIN_HINT = "^P";
const PICK_AGAIN_LABEL = "pick again";
const SWATCH_WIDTH = 12;
const LIST_SWATCH_WIDTH = 4;
const FORMAT_LABEL_WIDTH = 5;

export interface ScreenTitle {
  title: string;
  icon: string;
}

// Three rows tall, so the colour reads as a colour and not as a line. The notice is indented by
// drawScreen, which only does that for its first row.
const toSwatchNotice = (colour: Rgb): string => {
  const swatch = toSwatch(colour, SWATCH_WIDTH, supportsTrueColor());
  return [swatch, `${swatch}  ${toHex(colour)}`, swatch].join("\n  ");
};

/**
 * Offers the colour as hex, RGB and HSL. Resolves to a line to show, or "" when cancelled.
 * With pickAgain, a key leaves this list without copying and resolves to pickAgain's result.
 */
export const chooseFormat = async (
  colour: Rgb,
  title: ScreenTitle,
  pickAgain?: () => Promise<string>,
): Promise<string> => {
  drawScreen({ ...title, notice: toSwatchNotice(colour) });
  let wantsPickAgain = false;
  const keyPressed = new AbortController();
  const pickAgainKey: ExtraKey = {
    keys: [CTRL_P],
    hint: PICK_AGAIN_HINT,
    getLabel: () => PICK_AGAIN_LABEL,
    run: () => {
      wantsPickAgain = true;
      keyPressed.abort();
    },
  };
  // A result's own footer replaces the list's key hints, so the key has to be named here too.
  const footer =
    pickAgain === undefined ? FOOTER : `${FOOTER}   ${PICK_AGAIN_HINT} ${PICK_AGAIN_LABEL}`;
  const options: LauncherOption[] = toFormats(colour).map(({ label, text }) => ({
    value: text,
    name: label,
    aliases: [text],
    label: `${label.padEnd(FORMAT_LABEL_WIDTH)}${text}`,
    footer,
  }));
  const { cancelled, value } = await promptForSelection(() => options, "Copy as", {
    listWhenEmpty: true,
    replaceable: true,
    signal: keyPressed.signal,
    extraKeys: pickAgain === undefined ? [] : [pickAgainKey],
  });
  if (wantsPickAgain && pickAgain !== undefined) {
    return pickAgain();
  }
  if (cancelled || value === undefined) {
    return "";
  }
  await copyText(value);
  return `Copied ${value}`;
};

const toHistoryOption = (hex: string): LauncherOption => {
  const colour = fromHex(hex);
  const swatch = toSwatch(colour, LIST_SWATCH_WIDTH, supportsTrueColor());
  return {
    value: hex,
    name: hex,
    aliases: [toRgbText(colour), toHslText(colour)],
    label: `${swatch} ${hex}  ${styleText("gray", toRgbText(colour))}`,
    footer: LIST_FOOTER,
  };
};

/** Resolves to the chosen colour, or undefined when cancelled. */
export const chooseFromHistory = async (
  history: readonly string[],
  title: ScreenTitle,
): Promise<Rgb | undefined> => {
  drawScreen(title);
  const options = history.map(toHistoryOption);
  const { cancelled, value } = await promptForSelection(() => options, "Search past colours", {
    listWhenEmpty: true,
    replaceable: true,
  });
  return cancelled || value === undefined ? undefined : fromHex(value);
};
