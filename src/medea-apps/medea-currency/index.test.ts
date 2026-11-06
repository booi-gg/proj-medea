import assert from "node:assert/strict";
import { test } from "node:test";
import { toConversionItems } from "./index.ts";
import type { RatesSnapshot } from "./rates.ts";

const snapshot: RatesSnapshot = {
  fetchedAt: "2026-11-07T00:00:00.000Z",
  rates: {
    BSD: { date: "2026-11-07", rate: 1 },
    SDG: { date: "2026-11-07", rate: 2400 },
    INR: { date: "2026-11-07", rate: 94.19 },
    EUR: { date: "2026-11-06", rate: 0.8 },
  },
};

test("shows the exact conversion as a copyable answer", () => {
  const [item] = toConversionItems("356 USD to INR", snapshot);
  assert.equal(item?.name, "356 USD = 33,531.64 INR");
  assert.equal(item?.kind, "Rate 2026-11-07");
  assert.equal(item?.footer, "↵ copy");
});

test("suggests target currencies from a partial code", () => {
  const items = toConversionItems("356 INR to SD", snapshot);
  assert.deepEqual(
    items.map(({ value }) => value),
    ["medea-currency:answer:USD", "medea-currency:answer:SDG", "medea-currency:answer:BSD"],
  );
});

test("unknown currencies do not replace normal search results", () => {
  assert.deepEqual(toConversionItems("356 XYZ to INR", snapshot), []);
  assert.deepEqual(toConversionItems("356 USD to XYZ", snapshot), []);
});

test("first run explains why an answer is unavailable", () => {
  assert.match(toConversionItems("356 USD to INR", null)[0]?.name ?? "", /rates unavailable/i);
});
