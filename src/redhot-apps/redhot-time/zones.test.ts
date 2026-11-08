import assert from "node:assert/strict";
import { test } from "node:test";
import { answerTimeZone } from "./zones.ts";

const NOW = new Date("2026-11-08T12:00:00Z");
const SUMMER = new Date("2026-07-01T12:00:00Z");
const LOCAL = "Asia/Kolkata";

const answer = (text: string, now = NOW): ReturnType<typeof answerTimeZone> =>
  answerTimeZone(text, now, LOCAL);

test("converts a time in one place to another, and says when the day changes", () => {
  assert.deepEqual(answer("3pm PST in Tokyo"), {
    name: "3:00 PM PST = 8:00 AM Tokyo, Mon, Nov 9",
    answer: "8:00 AM",
  });
});

test("no day is shown when it's the same day in both places", () => {
  assert.equal(answer("3pm PST in Denver")?.name, "3:00 PM PST = 4:00 PM Denver");
});

test("says the time now in a place", () => {
  assert.deepEqual(answer("time in London"), {
    name: "London: 12:00 PM, Sun, Nov 8",
    answer: "12:00 PM",
  });
  assert.equal(answer("now in Tokyo")?.answer, "9:00 PM");
});

test("with no place given, the time is where you are", () => {
  assert.equal(answer("3pm in Tokyo")?.name, "3:00 PM = 6:30 PM Tokyo");
});

test("daylight saving is followed for the date in question", () => {
  assert.equal(answer("time in New York")?.answer, "7:00 AM");
  assert.equal(answer("time in New York", SUMMER)?.answer, "8:00 AM");
  assert.equal(answer("3pm PST in London", SUMMER)?.answer, "11:00 PM");
});

test("understands 24-hour times, minutes, noon and midnight", () => {
  assert.equal(answer("15:30 UTC to IST")?.answer, "9:00 PM");
  assert.equal(answer("3:30pm London in Paris")?.answer, "4:30 PM");
  assert.equal(answer("noon UTC in London")?.answer, "12:00 PM");
  assert.equal(answer("midnight UTC in Tokyo")?.answer, "9:00 AM");
  assert.equal(answer("12am UTC in London")?.answer, "12:00 AM");
  assert.equal(answer("12pm UTC in London")?.answer, "12:00 PM");
});

test("place names can be two words, and capitals don't matter", () => {
  assert.equal(answer("TIME IN new YORK")?.name, "New York: 7:00 AM, Sun, Nov 8");
  assert.equal(answer("3pm hong kong to san francisco")?.answer, "11:00 PM");
});

test("the copied time has an ordinary space, so it pastes cleanly", () => {
  assert.ok(!answer("time in London")?.answer.includes(" "));
});

test("anything else isn't a time question", () => {
  for (const text of [
    "time in Narnia",
    "3pm in Narnia",
    "3pm Narnia in Tokyo",
    "9am to 5pm",
    "13pm UTC in Tokyo",
    "25:00 UTC in Tokyo",
    "5 km in miles",
    "time in constructor",
    "3pm in toString",
    "Google Chrome",
    "",
  ]) {
    assert.equal(answer(text), undefined, text);
  }
});
