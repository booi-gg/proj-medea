import { copyText } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem } from "../types.ts";
import { convertCurrency, parseConversion } from "./convert.ts";
import { readRatesSync } from "./rates.ts";
import type { RatesSnapshot } from "./rates.ts";

const VALUE = "redhot-currency:answer";
const ICON = toRedhotIcon("¤");
const MAX_SUGGESTIONS = 8;
const COMMON_CODES = ["USD", "INR", "EUR", "GBP", "JPY", "CAD", "AUD"];

const currencyPriority = (code: string): number => {
  const position = COMMON_CODES.indexOf(code);
  return position === -1 ? COMMON_CODES.length : position;
};

/** Synchronous suggestions from the local cache, including incomplete target codes. */
export const toConversionItems = (
  query: string,
  snapshot: RatesSnapshot | null = readRatesSync() ?? null,
): LauncherItem[] => {
  const request = parseConversion(query);
  if (request === undefined) {
    return [];
  }
  if (snapshot === null) {
    return [
      {
        value: VALUE,
        name: "Currency rates unavailable — waiting for download",
        icon: ICON,
        kind: "Currency",
        footer: "Rates refresh when search opens",
        run: async () => "Currency rates are not available yet. Reopen search to retry.",
      },
    ];
  }
  if (request.source !== "USD" && snapshot.rates[request.source] === undefined) {
    return [];
  }
  const codes = new Set(["USD", ...Object.keys(snapshot.rates)]);
  const matching = [...codes]
    .filter((code) => code.includes(request.targetFragment))
    .sort((left, right) => {
      const priority = currencyPriority(left) - currencyPriority(right);
      if (priority !== 0) {
        return priority;
      }
      const leftStarts = left.startsWith(request.targetFragment);
      const rightStarts = right.startsWith(request.targetFragment);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.localeCompare(right);
    })
    .slice(0, MAX_SUGGESTIONS);
  return matching.flatMap((target) => {
    const result = convertCurrency(request.amount, request.source, target, snapshot);
    if (result === undefined) {
      return [];
    }
    const item: LauncherItem = {
      value: `${VALUE}:${target}`,
      name: `${request.amount} ${request.source} = ${result.displayAnswer} ${target}`,
      icon: ICON,
      kind: `Rate ${result.dates}`,
      footer: "↵ copy",
      run: async () => {
        await copyText(result.answer);
        return `Copied ${result.answer}`;
      },
    };
    return [item];
  });
};
