const TIMER_QUERY = /^timer\s+(.+)$/i;
const BARE_NUMBER = /^\d+(?:\.\d+)?$/;
const DURATION = /^(?:\d+(?:\.\d+)?\s*(?:h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\s*)+$/;
const DURATION_PART = /(\d+(?:\.\d+)?)\s*([hms])/g;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const UNIT_SECONDS: Record<string, number> = { h: SECONDS_PER_HOUR, m: SECONDS_PER_MINUTE, s: 1 };
// Long enough for anything a timer is for, and the menu bar title stays short.
const MAX_SECONDS = 24 * SECONDS_PER_HOUR;

const toSeconds = (total: number): number | undefined => {
  const seconds = Math.round(total);
  return seconds >= 1 && seconds <= MAX_SECONDS ? seconds : undefined;
};

/** Reads "25m", "1h 30m", "90 seconds" or a bare "25", which means minutes. */
export const parseDuration = (text: string): number | undefined => {
  const trimmed = text.trim().toLowerCase();
  if (BARE_NUMBER.test(trimmed)) {
    return toSeconds(Number(trimmed) * SECONDS_PER_MINUTE);
  }
  if (!DURATION.test(trimmed)) {
    return undefined;
  }
  let total = 0;
  for (const [, amount, unit] of trimmed.matchAll(DURATION_PART)) {
    total += Number(amount) * (UNIT_SECONDS[unit ?? ""] ?? 0);
  }
  return toSeconds(total);
};

/** The length asked for by text like "timer 25m", or undefined when the text isn't that. */
export const toTimerSeconds = (query: string): number | undefined => {
  const duration = TIMER_QUERY.exec(query.trim())?.[1];
  return duration === undefined ? undefined : parseDuration(duration);
};

const toUnitText = (amount: number, unit: string): string =>
  amount === 0 ? "" : `${amount} ${unit}${amount === 1 ? "" : "s"}`;

/** Text like "1 hour 30 minutes". */
export const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return [toUnitText(hours, "hour"), toUnitText(minutes, "minute"), toUnitText(seconds, "second")]
    .filter((part) => part !== "")
    .join(" ");
};
