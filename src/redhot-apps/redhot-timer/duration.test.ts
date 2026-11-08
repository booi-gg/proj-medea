import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, parseDuration, toTimerSeconds } from "./duration.ts";

test("reads a length in any of the usual spellings", () => {
  assert.equal(parseDuration("25m"), 1500);
  assert.equal(parseDuration("25 min"), 1500);
  assert.equal(parseDuration("25 minutes"), 1500);
  assert.equal(parseDuration("90s"), 90);
  assert.equal(parseDuration("2 hours"), 7200);
  assert.equal(parseDuration("1H"), 3600);
});

test("adds up the parts of a length", () => {
  assert.equal(parseDuration("1h30m"), 5400);
  assert.equal(parseDuration("1h 30m 15s"), 5415);
});

test("a bare number is minutes", () => {
  assert.equal(parseDuration("25"), 1500);
});

test("a fraction is allowed", () => {
  assert.equal(parseDuration("1.5h"), 5400);
});

test("refuses text that isn't a length", () => {
  assert.equal(parseDuration("tea"), undefined);
  assert.equal(parseDuration("5 days"), undefined);
  assert.equal(parseDuration("5m tea"), undefined);
  assert.equal(parseDuration(""), undefined);
});

test("refuses a length of nothing, or over a day", () => {
  assert.equal(parseDuration("0m"), undefined);
  assert.equal(parseDuration("0"), undefined);
  assert.equal(parseDuration("24h"), 86_400);
  assert.equal(parseDuration("24h 1s"), undefined);
});

test("only text starting with timer and a length asks for one", () => {
  assert.equal(toTimerSeconds("timer 25m"), 1500);
  assert.equal(toTimerSeconds("  TIMER   5  "), 300);
  assert.equal(toTimerSeconds("timer"), undefined);
  assert.equal(toTimerSeconds("timer tea"), undefined);
  assert.equal(toTimerSeconds("25m"), undefined);
  assert.equal(toTimerSeconds("timers 25m"), undefined);
});

test("says a length in words, leaving out what's zero", () => {
  assert.equal(formatDuration(1500), "25 minutes");
  assert.equal(formatDuration(5400), "1 hour 30 minutes");
  assert.equal(formatDuration(3661), "1 hour 1 minute 1 second");
  assert.equal(formatDuration(1), "1 second");
});
