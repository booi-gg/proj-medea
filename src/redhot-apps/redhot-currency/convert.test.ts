import assert from "node:assert/strict";
import { test } from "node:test";
import { convertCurrency, parseConversion } from "./convert.ts";
import type { RatesSnapshot } from "./rates.ts";

const snapshot: RatesSnapshot = {
  fetchedAt: "2026-11-07T00:00:00.000Z",
  rates: {
    EUR: { date: "2026-11-06", rate: 0.8 },
    INR: { date: "2026-11-07", rate: 94.19 },
    GBP: { date: "2026-11-07", rate: 0.75 },
  },
};

test("parses both phrasings and a partial target code", () => {
  assert.deepEqual(parseConversion("356 USD to INR"), {
    amount: 356,
    source: "USD",
    targetFragment: "INR",
  });
  assert.deepEqual(parseConversion(" 1.5 eur IN sd "), {
    amount: 1.5,
    source: "EUR",
    targetFragment: "SD",
  });
});

test("accepts codes and literal symbols for source and target", () => {
  assert.deepEqual(parseConversion("$356 to INR"), {
    amount: 356,
    source: "USD",
    targetFragment: "INR",
  });
  assert.deepEqual(parseConversion("356₹ in $"), {
    amount: 356,
    source: "INR",
    targetFragment: "USD",
  });
  assert.deepEqual(parseConversion("-€1.5 to £"), {
    amount: -1.5,
    source: "EUR",
    targetFragment: "GBP",
  });
});

test("leaves other search text alone", () => {
  for (const query of ["100 usd", "usd to inr", "100 usd to inrsggg", "100 usd to 1nr", "hello"]) {
    assert.equal(parseConversion(query), undefined);
  }
});

test("offers targets after the conversion keyword", () => {
  assert.deepEqual(parseConversion("100 usd to "), {
    amount: 100,
    source: "USD",
    targetFragment: "",
  });
});

test("accepts longer currency codes from the rate feed", () => {
  assert.deepEqual(parseConversion("2 aave to usd"), {
    amount: 2,
    source: "AAVE",
    targetFragment: "USD",
  });
});

test("converts through USD and shows every rate date used", () => {
  assert.deepEqual(convertCurrency(100, "EUR", "INR", snapshot), {
    answer: "11773.75",
    displayAnswer: "11,773.75",
    dates: "2026-11-06 / 2026-11-07",
  });
  assert.equal(convertCurrency(100, "USD", "INR", snapshot)?.answer, "9419");
  assert.equal(convertCurrency(100, "INR", "USD", snapshot)?.answer, "1.06");
});

test("rounds the copied amount to two decimals and rejects unavailable codes", () => {
  assert.equal(convertCurrency(1, "USD", "GBP", snapshot)?.answer, "0.75");
  assert.equal(convertCurrency(1, "USD", "XYZ", snapshot), undefined);
  assert.equal(convertCurrency(1, "XYZ", "USD", snapshot), undefined);
});
