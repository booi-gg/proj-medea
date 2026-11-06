const BMP_SIGNATURE = "BM";
const DATA_OFFSET_POSITION = 10;
const WIDTH_POSITION = 18;
const HEIGHT_POSITION = 22;
const BITS_POSITION = 28;
const SUPPORTED_BITS = new Set([24, 32]);
// A transparent image needs something behind it, and a dark grey suits most terminals.
const BACKDROP = 38;
const MAX_CHANNEL = 255;
const UPPER_HALF_BLOCK = "▀";
const RESET_COLORS = "\u001B[0m";

export interface Pixels {
  width: number;
  height: number;
  /** Red, green and blue for each pixel, row by row from the top. */
  rgb: Uint8Array;
}

const blend = (channel: number, alpha: number): number =>
  Math.round((channel * alpha + BACKDROP * (MAX_CHANNEL - alpha)) / MAX_CHANNEL);

/** Reads the small uncompressed BMP that sips writes. Returns undefined for anything else. */
export const parseBmp = (file: Buffer): Pixels | undefined => {
  if (file.length <= BITS_POSITION + 1 || file.toString("latin1", 0, 2) !== BMP_SIGNATURE) {
    return undefined;
  }
  const dataOffset = file.readUInt32LE(DATA_OFFSET_POSITION);
  const width = file.readInt32LE(WIDTH_POSITION);
  const rawHeight = file.readInt32LE(HEIGHT_POSITION);
  const bits = file.readUInt16LE(BITS_POSITION);
  const height = Math.abs(rawHeight);
  if (!SUPPORTED_BITS.has(bits) || width <= 0 || height === 0) {
    return undefined;
  }
  const bytesPerPixel = bits / 8;
  // Rows are padded to four bytes.
  const stride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  if (dataOffset + stride * height > file.length) {
    return undefined;
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    // A positive height means the file stores the bottom row first.
    const sourceRow = rawHeight > 0 ? height - 1 - row : row;
    for (let column = 0; column < width; column += 1) {
      const source = dataOffset + sourceRow * stride + column * bytesPerPixel;
      const alpha = bytesPerPixel === 4 ? (file[source + 3] ?? MAX_CHANNEL) : MAX_CHANNEL;
      const target = (row * width + column) * 3;
      rgb[target] = blend(file[source + 2] ?? 0, alpha);
      rgb[target + 1] = blend(file[source + 1] ?? 0, alpha);
      rgb[target + 2] = blend(file[source] ?? 0, alpha);
    }
  }
  return { width, height, rgb };
};

const toColor = ({ width, rgb }: Pixels, column: number, row: number): string => {
  const position = (row * width + column) * 3;
  return `${rgb[position]};${rgb[position + 1]};${rgb[position + 2]}`;
};

/**
 * Draws an image as text. A terminal cell is about twice as tall as it is wide, so each ▀ shows
 * two square pixels: its own colour on top, and its background below. This works in any terminal
 * with 24-bit colour, while real image protocols work only in some.
 */
export const toBlockLines = (pixels: Pixels, maxColumns: number, maxRows: number): string[] => {
  const scale = Math.min(maxColumns / pixels.width, (maxRows * 2) / pixels.height, 1);
  const columns = Math.max(1, Math.floor(pixels.width * scale));
  const rows = Math.max(1, Math.floor((pixels.height * scale) / 2));
  const toSourceColumn = (column: number): number =>
    Math.min(pixels.width - 1, Math.floor(column / scale));
  const toSourceRow = (halfRow: number): number =>
    Math.min(pixels.height - 1, Math.floor(halfRow / scale));

  return Array.from({ length: rows }, (_unusedRow, row) => {
    const cells = Array.from({ length: columns }, (_unusedColumn, column) => {
      const sourceColumn = toSourceColumn(column);
      const top = toColor(pixels, sourceColumn, toSourceRow(row * 2));
      const bottom = toColor(pixels, sourceColumn, toSourceRow(row * 2 + 1));
      return `\u001B[38;2;${top}m\u001B[48;2;${bottom}m${UPPER_HALF_BLOCK}`;
    });
    return `${cells.join("")}${RESET_COLORS}`;
  });
};
