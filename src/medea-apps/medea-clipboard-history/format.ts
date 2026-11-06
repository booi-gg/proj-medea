const WHITESPACE = /\s+/g;
// Copied text can hold escape codes, which would otherwise run in this terminal.
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const ELLIPSIS = "…";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Fits copied text on one safe line. */
export const toPreview = (text: string, maxLength: number): string => {
  const line = text.replaceAll(WHITESPACE, " ").replaceAll(CONTROL_CHARACTERS, "").trim();
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 1)}${ELLIPSIS}`;
};

export const formatAge = (copiedAt: number, now: number): string => {
  const age = now - copiedAt;
  if (age < MINUTE_MS) {
    return "now";
  }
  if (age < HOUR_MS) {
    return `${Math.floor(age / MINUTE_MS)}m`;
  }
  if (age < DAY_MS) {
    return `${Math.floor(age / HOUR_MS)}h`;
  }
  return `${Math.floor(age / DAY_MS)}d`;
};
