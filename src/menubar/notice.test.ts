import assert from "node:assert/strict";
import { test } from "node:test";
import { toNoticeRequest } from "./notice.ts";

const readRequest = (request: string): Record<string, unknown> => {
  const [command, encoded = ""] = request.split(" ");
  assert.equal(command, "notice");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
};

// What the helper's socket reads, with room for the trace in front.
const SOCKET_LIMIT = 4096 - 80;

test("sends the text as one line", () => {
  const request = toNoticeRequest({ title: "Disk Free", message: "95% free\nof 500 GB" });
  assert.ok(!request.includes("\n"));
  assert.deepEqual(readRequest(request), {
    title: "Disk Free",
    message: "95% free of 500 GB",
    isError: false,
  });
});

test("removes colours and other escape codes", () => {
  const { message } = readRequest(
    toNoticeRequest({ title: "Hi", message: "\u001B[31mfailed\u001B[0m\u0007 now" }),
  );
  assert.equal(message, "failed now");
});

test("marks errors", () => {
  assert.equal(
    readRequest(toNoticeRequest({ title: "a", message: "b", isError: true })).isError,
    true,
  );
});

test("even a very long emoji message fits the socket, cut at a whole character", () => {
  const request = toNoticeRequest({ title: "🔥".repeat(500), message: "👩‍💻".repeat(2000) });
  assert.ok(request.length < SOCKET_LIMIT, String(request.length));
  const { message } = readRequest(request);
  assert.ok(typeof message === "string" && message.endsWith("👩‍💻…"));
});
