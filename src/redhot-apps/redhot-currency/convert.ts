import type { RatesSnapshot } from "./rates.ts";

const PREFIX_CONVERSION =
  /^([+-]?)([$€£₹¥₩])(\d+(?:\.\d*)?|\.\d+)\s+(?:to|in)(?:\s+([a-z]{1,6}|[$€£₹¥₩]))?$/i;
const SUFFIX_CONVERSION =
  /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s+([a-z]{3,6})|\s*([$€£₹¥₩]))\s+(?:to|in)(?:\s+([a-z]{1,6}|[$€£₹¥₩]))?$/i;
const DECIMAL_PLACES = 2;
const DISPLAY_NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: DECIMAL_PLACES });
const SYMBOL_CODES: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
  "₩": "KRW",
};

export interface ConversionRequest {
  amount: number;
  source: string;
  targetFragment: string;
}

export interface ConversionResult {
  answer: string;
  displayAnswer: string;
  dates: string;
}

/** Parses a conversion prompt, including an incomplete target for suggestions. */
export const parseConversion = (text: string): ConversionRequest | undefined => {
  const trimmed = text.trim();
  const prefixMatch = PREFIX_CONVERSION.exec(trimmed);
  const suffixMatch = prefixMatch === null ? SUFFIX_CONVERSION.exec(trimmed) : null;
  if (prefixMatch === null && suffixMatch === null) {
    return undefined;
  }
  const amount = Number(
    prefixMatch === null ? suffixMatch?.[1] : `${prefixMatch[1]}${prefixMatch[3]}`,
  );
  const sourceInput = prefixMatch?.[2] ?? suffixMatch?.[2] ?? suffixMatch?.[3];
  const targetInput = prefixMatch?.[4] ?? suffixMatch?.[4];
  const source =
    sourceInput === undefined
      ? undefined
      : (SYMBOL_CODES[sourceInput] ?? sourceInput.toUpperCase());
  const targetFragment =
    targetInput === undefined ? "" : (SYMBOL_CODES[targetInput] ?? targetInput.toUpperCase());
  if (!Number.isFinite(amount) || source === undefined) {
    return undefined;
  }
  return { amount, source, targetFragment };
};

/** All saved rates have USD as their base. */
export const convertCurrency = (
  amount: number,
  source: string,
  target: string,
  snapshot: RatesSnapshot,
): ConversionResult | undefined => {
  const sourceRate = source === "USD" ? 1 : snapshot.rates[source]?.rate;
  const targetRate = target === "USD" ? 1 : snapshot.rates[target]?.rate;
  if (sourceRate === undefined || targetRate === undefined) {
    return undefined;
  }
  const converted = (amount / sourceRate) * targetRate;
  if (!Number.isFinite(converted)) {
    return undefined;
  }
  const rounded = Number(converted.toFixed(DECIMAL_PLACES));
  const dates = [snapshot.rates[source]?.date, snapshot.rates[target]?.date]
    .filter((date): date is string => date !== undefined)
    .filter((date, index, all) => all.indexOf(date) === index)
    .sort()
    .join(" / ");
  return {
    answer: String(rounded),
    displayAnswer: DISPLAY_NUMBER.format(rounded),
    dates:
      dates ||
      Object.values(snapshot.rates)
        .map(({ date }) => date)
        .sort()
        .at(-1) ||
      "",
  };
};
