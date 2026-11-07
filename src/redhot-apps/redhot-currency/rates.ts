import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { currencyRatesPath } from "../../paths.ts";
import { writeLog } from "../../log.ts";

const RATES_URL = "https://api.frankfurter.dev/v2/rates?base=USD";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const CURRENCY_CODE = /^[A-Z]{3,6}$/;
const RATE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Rate {
  date: string;
  rate: number;
}

export interface RatesSnapshot {
  fetchedAt: string;
  rates: Record<string, Rate>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRate = (value: unknown): value is Rate =>
  isRecord(value) &&
  typeof value.date === "string" &&
  RATE_DATE.test(value.date) &&
  typeof value.rate === "number" &&
  Number.isFinite(value.rate) &&
  value.rate > 0;

/** Reject incomplete or broken files so a later refresh can replace them. */
export const parseRates = (text: string): RatesSnapshot | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      !isRecord(parsed) ||
      typeof parsed.fetchedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.fetchedAt)) ||
      !isRecord(parsed.rates)
    ) {
      return undefined;
    }
    const entries = Object.entries(parsed.rates);
    if (entries.length === 0) {
      return undefined;
    }
    const rates: Record<string, Rate> = {};
    for (const [code, rate] of entries) {
      if (!CURRENCY_CODE.test(code) || !isRate(rate)) {
        return undefined;
      }
      rates[code] = { date: rate.date, rate: rate.rate };
    }
    return { fetchedAt: parsed.fetchedAt, rates };
  } catch {
    return undefined;
  }
};

export const readRatesSync = (path = currencyRatesPath): RatesSnapshot | undefined => {
  try {
    return parseRates(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
};

export const needsRatesRefresh = (
  snapshot: RatesSnapshot | undefined,
  now = Date.now(),
): boolean => {
  if (snapshot === undefined) {
    return true;
  }
  const age = now - Date.parse(snapshot.fetchedAt);
  return age < 0 || age >= REFRESH_INTERVAL_MS;
};

/** One fixed endpoint; amounts and search text never go on the network. */
export const parseApiRates = (body: unknown, fetchedAt: string): RatesSnapshot | undefined => {
  if (!Array.isArray(body) || body.length === 0) {
    return undefined;
  }
  const rates: Record<string, Rate> = {};
  for (const row of body) {
    if (
      !isRecord(row) ||
      row.base !== "USD" ||
      typeof row.quote !== "string" ||
      !CURRENCY_CODE.test(row.quote) ||
      !isRate(row)
    ) {
      return undefined;
    }
    rates[row.quote] = { date: row.date, rate: row.rate };
  }
  return { fetchedAt, rates };
};

/** Returns false on a failed download, leaving any saved rates intact. */
export const refreshRates = async (
  path = currencyRatesPath,
  fetchRates: typeof fetch = fetch,
): Promise<boolean> => {
  try {
    const response = await fetchRates(RATES_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      return false;
    }
    const snapshot = parseApiRates(await response.json(), new Date().toISOString());
    if (snapshot === undefined) {
      return false;
    }
    await mkdir(dirname(path), { recursive: true });
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`);
      await rename(temporaryPath, path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return true;
  } catch (error) {
    writeLog("currency.refresh-failed", { error }, { level: "warn" });
    return false;
  }
};

/** Called when search opens, without waiting for the network. */
export const refreshRatesIfStale = async (): Promise<void> => {
  if (needsRatesRefresh(readRatesSync())) {
    await refreshRates();
  }
};
