import assert from "node:assert/strict";
import { test } from "node:test";
import stringWidth from "string-width";
import { parseBmp, toBlockLines } from "./image-preview.ts";

interface BmpShape {
  width: number;
  rawHeight: number;
  bits: number;
  data: number[];
}

const toBmp = ({ width, rawHeight, bits, data }: BmpShape): Buffer => {
  const header = Buffer.alloc(54);
  header.write("BM");
  header.writeUInt32LE(54, 10);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(rawHeight, 22);
  header.writeUInt16LE(bits, 28);
  return Buffer.concat([header, Buffer.from(data)]);
};

test("reads a top-down 24-bit file, turning blue-green-red into red-green-blue", () => {
  const pixels = parseBmp(toBmp({ width: 1, rawHeight: -1, bits: 24, data: [1, 2, 3, 0] }));
  assert.deepEqual([...(pixels?.rgb ?? [])], [3, 2, 1]);
});

test("flips a bottom-up file", () => {
  // Two rows of one pixel, each padded to four bytes. The file stores the bottom row first.
  const data = [0, 0, 9, 0, 0, 0, 7, 0];
  const pixels = parseBmp(toBmp({ width: 1, rawHeight: 2, bits: 24, data }));
  assert.deepEqual([...(pixels?.rgb ?? [])], [7, 0, 0, 9, 0, 0]);
});

test("skips the padding at the end of each row", () => {
  const data = [1, 1, 1, 2, 2, 2, 0, 0, 3, 3, 3, 4, 4, 4, 0, 0];
  const pixels = parseBmp(toBmp({ width: 2, rawHeight: -2, bits: 24, data }));
  assert.deepEqual([...(pixels?.rgb ?? [])], [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
});

test("shows a transparent pixel as the backdrop", () => {
  const pixels = parseBmp(toBmp({ width: 1, rawHeight: -1, bits: 32, data: [200, 200, 200, 0] }));
  assert.deepEqual([...(pixels?.rgb ?? [])], [38, 38, 38]);
});

test("keeps an opaque pixel in a 32-bit file", () => {
  const pixels = parseBmp(toBmp({ width: 1, rawHeight: -1, bits: 32, data: [1, 2, 3, 255] }));
  assert.deepEqual([...(pixels?.rgb ?? [])], [3, 2, 1]);
});

test("rejects files it can't read", () => {
  assert.equal(parseBmp(Buffer.from("not a bmp")), undefined);
  assert.equal(
    parseBmp(toBmp({ width: 1, rawHeight: -1, bits: 8, data: [0, 0, 0, 0] })),
    undefined,
  );
  assert.equal(parseBmp(toBmp({ width: 9, rawHeight: -9, bits: 24, data: [] })), undefined);
});

const solid = (width: number, height: number) => ({
  width,
  height,
  rgb: new Uint8Array(width * height * 3).fill(100),
});

test("each row of blocks shows two rows of pixels", () => {
  const lines = toBlockLines(solid(4, 8), 40, 40);
  assert.equal(lines.length, 4);
  assert.equal(stringWidth(lines[0] ?? ""), 4);
});

test("shrinks a large image to fit and keeps its shape", () => {
  const lines = toBlockLines(solid(100, 50), 20, 40);
  assert.equal(stringWidth(lines[0] ?? ""), 20);
  assert.equal(lines.length, 5);
});

test("a tall image is limited by the rows", () => {
  const lines = toBlockLines(solid(10, 100), 40, 5);
  assert.equal(lines.length, 5);
  assert.equal(stringWidth(lines[0] ?? ""), 1);
});

test("never leaves colours on after a row", () => {
  assert.ok(toBlockLines(solid(2, 2), 10, 10)[0]?.endsWith("\u001B[0m"));
});
