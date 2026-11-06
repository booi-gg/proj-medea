import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  needsRatesRefresh,
  parseApiRates,
  parseRates,
  readRatesSync,
  refreshRates,
} from "./rates.ts";

const fetchedAt = "2026-11-07T00:00:00.000Z";
const validRows = [{ date: "2026-11-06", base: "USD", quote: "INR", rate: 94.19 }];
const saved = JSON.stringify({ fetchedAt, rates: { INR: { date: "2026-11-06", rate: 94.19 } } });

test("reads a valid snapshot and treats missing or broken files as unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "medea-currency-test-"));
  const path = join(directory, "rates.json");
  try {
    assert.equal(readRatesSync(path), undefined);
    await writeFile(path, "broken");
    assert.equal(readRatesSync(path), undefined);
    await writeFile(path, saved);
    assert.equal(readRatesSync(path)?.rates.INR?.rate, 94.19);
    assert.equal(parseRates('{"fetchedAt":"bad","rates":{}}'), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refreshes missing and day-old rates", () => {
  const snapshot = parseRates(saved);
  assert.equal(needsRatesRefresh(undefined), true);
  assert.equal(needsRatesRefresh(snapshot, Date.parse(fetchedAt) + 23 * 60 * 60 * 1000), false);
  assert.equal(needsRatesRefresh(snapshot, Date.parse(fetchedAt) + 24 * 60 * 60 * 1000), true);
});

test("rejects incomplete API data", () => {
  assert.equal(parseApiRates([], fetchedAt), undefined);
  assert.equal(parseApiRates([{ ...validRows[0], rate: -1 }], fetchedAt), undefined);
  assert.equal(parseApiRates([{ ...validRows[0], base: "EUR" }], fetchedAt), undefined);
});

test("keeps the longer crypto codes in the API response", () => {
  const snapshot = parseApiRates(
    [...validRows, { date: "2026-11-06", base: "USD", quote: "AAVE", rate: 0.007815 }],
    fetchedAt,
  );
  assert.equal(snapshot?.rates.AAVE?.rate, 0.007815);
});

test("failed refresh keeps the saved file, while a good refresh replaces it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "medea-currency-test-"));
  const path = join(directory, "rates.json");
  try {
    await writeFile(path, saved);
    const failedFetch: typeof fetch = async () => new Response("Unavailable", { status: 503 });
    assert.equal(await refreshRates(path, failedFetch), false);
    assert.equal(await readFile(path, "utf8"), saved);

    const goodFetch: typeof fetch = async (input) => {
      assert.equal(input, "https://api.frankfurter.dev/v2/rates?base=USD");
      return Response.json(validRows);
    };
    assert.equal(await refreshRates(path, goodFetch), true);
    assert.equal(readRatesSync(path)?.rates.INR?.rate, 94.19);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
