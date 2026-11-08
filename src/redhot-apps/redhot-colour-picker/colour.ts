const CHANNEL_MAXIMUM = 255;
const FULL_CIRCLE_DEGREES = 360;
const DEGREES_PER_HUE_SECTOR = 60;
const HUE_SECTORS = 6;
const PERCENT = 100;
const HEX_RADIX = 16;
const HEX_CHANNEL_DIGITS = 2;
const HEX_COLOUR = /^#[0-9A-F]{6}$/u;
// The 256-colour palette has a 6×6×6 cube of colours, which starts at this number.
const COLOUR_CUBE_START = 16;
const COLOUR_CUBE_STEPS = 5;
const COLOUR_CUBE_RED_WEIGHT = 36;
const COLOUR_CUBE_GREEN_WEIGHT = 6;
const DEFAULT_BACKGROUND = "\u001B[49m";

export interface Rgb {
  red: number;
  green: number;
  blue: number;
}

export interface ColourFormat {
  label: string;
  text: string;
}

const isChannel = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value >= 0 && value <= CHANNEL_MAXIMUM;

/** Reads the sampler's "red green blue". Undefined for no output, which means it was cancelled. */
export const parseSample = (output: string): Rgb | undefined => {
  const parts = output.trim().split(" ");
  const [red, green, blue] = parts.map(Number);
  if (parts.length !== 3 || !isChannel(red) || !isChannel(green) || !isChannel(blue)) {
    return undefined;
  }
  return { red, green, blue };
};

export const isHexColour = (text: string): boolean => HEX_COLOUR.test(text);

export const toHex = ({ red, green, blue }: Rgb): string => {
  const digits = [red, green, blue].map((channel) =>
    channel.toString(HEX_RADIX).padStart(HEX_CHANNEL_DIGITS, "0"),
  );
  return `#${digits.join("").toUpperCase()}`;
};

export const fromHex = (hex: string): Rgb => {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + HEX_CHANNEL_DIGITS), HEX_RADIX),
  );
  return { red: red ?? 0, green: green ?? 0, blue: blue ?? 0 };
};

export const toRgbText = ({ red, green, blue }: Rgb): string => `rgb(${red}, ${green}, ${blue})`;

const toHue = (red: number, green: number, blue: number, max: number, delta: number): number => {
  if (delta === 0) {
    return 0;
  }
  if (max === red) {
    return ((green - blue) / delta + HUE_SECTORS) % HUE_SECTORS;
  }
  return max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
};

export const toHslText = (colour: Rgb): string => {
  const red = colour.red / CHANNEL_MAXIMUM;
  const green = colour.green / CHANNEL_MAXIMUM;
  const blue = colour.blue / CHANNEL_MAXIMUM;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  // A red just past 359.5 rounds to 360, which is written as 0.
  const hue =
    Math.round(toHue(red, green, blue, max, delta) * DEGREES_PER_HUE_SECTOR) % FULL_CIRCLE_DEGREES;
  return `hsl(${hue}, ${Math.round(saturation * PERCENT)}%, ${Math.round(lightness * PERCENT)}%)`;
};

export const toFormats = (colour: Rgb): ColourFormat[] => [
  { label: "Hex", text: toHex(colour) },
  { label: "RGB", text: toRgbText(colour) },
  { label: "HSL", text: toHslText(colour) },
];

const toCubeStep = (channel: number): number =>
  Math.round((channel / CHANNEL_MAXIMUM) * COLOUR_CUBE_STEPS);

const toBackgroundCode = ({ red, green, blue }: Rgb, trueColor: boolean): string => {
  if (trueColor) {
    return `\u001B[48;2;${red};${green};${blue}m`;
  }
  const palette =
    COLOUR_CUBE_START +
    COLOUR_CUBE_RED_WEIGHT * toCubeStep(red) +
    COLOUR_CUBE_GREEN_WEIGHT * toCubeStep(green) +
    toCubeStep(blue);
  return `\u001B[48;5;${palette}m`;
};

/** A block of this colour. Terminals without full colour get the nearest of their 256. */
export const toSwatch = (colour: Rgb, width: number, trueColor: boolean): string =>
  `${toBackgroundCode(colour, trueColor)}${" ".repeat(width)}${DEFAULT_BACKGROUND}`;
