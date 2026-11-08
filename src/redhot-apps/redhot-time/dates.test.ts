import assert from "node:assert/strict";
import { test } from "node:test";
import { answerDate } from "./dates.ts";

const NOW = new Date(2026, 10, 8, 15, 30);

const answer = (text: string, now = NOW): ReturnType<typeof answerDate> => answerDate(text, now);

test("counts the days until a date", () => {
  assert.deepEqual(answer("days until dec 25"), {
    name: "47 days until Fri, Dec 25, 2026",
    answer: "47",
  });
});

test("adds days to today", () => {
  assert.deepEqual(answer("today + 90 days"), {
    name: "today + 90 days = Sat, Feb 6, 2027",
    answer: "Sat, Feb 6, 2027",
  });
});

test("a date that has passed this year means next year when counting up to it", () => {
  assert.equal(answer("days until jan 1")?.name, "54 days until Fri, Jan 1, 2027");
});

test("a date still to come this year means last year when counting since it", () => {
  assert.equal(answer("days since dec 25")?.name, "318 days since Thu, Dec 25, 2025");
});

test("today counts as zero days and reads sensibly", () => {
  assert.equal(answer("days until nov 8")?.name, "0 days since Sun, Nov 8, 2026");
});

test("one day isn't plural", () => {
  assert.equal(answer("days until tomorrow")?.name, "1 day until Mon, Nov 9, 2026");
});

test("a date with a year in the past still gives a plain count", () => {
  assert.deepEqual(answer("days until 2026-11-01"), {
    name: "7 days since Sun, Nov 1, 2026",
    answer: "7",
  });
});

test("long counts group their thousands, and the copied number doesn't", () => {
  const counted = answer("days since 2020-01-01");
  assert.equal(counted?.name, "2,503 days since Wed, Jan 1, 2020");
  assert.equal(counted?.answer, "2503");
});

test("understands the usual ways of writing a date", () => {
  for (const text of [
    "dec 25",
    "december 25",
    "Dec. 25",
    "dec 25th",
    "25 dec",
    "25th december",
    "dec 25 2026",
    "dec 25, 2026",
    "2026-12-25",
  ]) {
    assert.equal(answer(`days until ${text}`)?.answer, "47", text);
  }
});

test("takes away as well as adds, in weeks, months and years", () => {
  assert.equal(answer("today - 7 days")?.answer, "Sun, Nov 1, 2026");
  assert.equal(answer("today + 2 weeks")?.answer, "Sun, Nov 22, 2026");
  assert.equal(answer("today + 1 month")?.answer, "Tue, Dec 8, 2026");
  assert.equal(answer("today + 1 year")?.answer, "Mon, Nov 8, 2027");
  assert.equal(answer("tomorrow + 1 day")?.answer, "Tue, Nov 10, 2026");
});

test("a dated start can have dashes of its own", () => {
  assert.equal(answer("2026-12-25 + 7 days")?.answer, "Fri, Jan 1, 2027");
  assert.equal(answer("2026-12-25 - 1 day")?.answer, "Thu, Dec 24, 2026");
});

test("a month later stays in that month, even from the 31st", () => {
  assert.equal(answer("2027-01-31 + 1 month")?.answer, "Sun, Feb 28, 2027");
  assert.equal(answer("2028-02-29 + 1 year")?.answer, "Wed, Feb 28, 2029");
});

test("understands from, after and ago", () => {
  assert.equal(answer("90 days from today")?.answer, "Sat, Feb 6, 2027");
  assert.equal(answer("90 days from now")?.answer, "Sat, Feb 6, 2027");
  assert.equal(answer("1 week after dec 25")?.answer, "Fri, Jan 1, 2027");
  assert.equal(answer("3 weeks ago")?.answer, "Sun, Oct 18, 2026");
});

test("Feb 29 waits for a year that has one", () => {
  assert.equal(answer("days until feb 29")?.name, "478 days until Tue, Feb 29, 2028");
});

test("daylight saving doesn't throw the count off by a day", () => {
  const beforeChange = new Date(2026, 2, 1, 23, 30);
  assert.equal(answer("days until apr 1", beforeChange)?.answer, "31");
});

test("anything else isn't a date question", () => {
  for (const text of [
    "days until banana",
    "days until feb 30",
    "days until 2026-02-30",
    "days until 2026-13-01",
    "today + days",
    "today plus 90 days",
    "banana + 90 days",
    "2 + 2",
    "days",
    "mar",
    "Google Chrome",
    "",
  ]) {
    assert.equal(answer(text), undefined, text);
  }
});
