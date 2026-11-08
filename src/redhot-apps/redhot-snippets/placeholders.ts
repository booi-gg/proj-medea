// native/SnippetMatcher.swift fills these as well, for expansion, and has to give the same result.
const PLACEHOLDER = /\{(date|time|clipboard|cursor)\}/g;
const CLIPBOARD_PLACEHOLDER = "{clipboard}";
const PAD_LENGTH = 2;

const pad = (value: number): string => String(value).padStart(PAD_LENGTH, "0");

const formatDate = (now: Date): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const formatTime = (now: Date): string => `${pad(now.getHours())}:${pad(now.getMinutes())}`;

export const usesClipboard = (text: string): boolean => text.includes(CLIPBOARD_PLACEHOLDER);

interface SnippetValues {
  now: Date;
  clipboard: string;
}

/**
 * Fills in one pass, so a {date} inside the copied text stays as it is. There's nowhere for the
 * cursor to go in a copy, so {cursor} is dropped here and only means something when expanding.
 */
export const fillSnippet = (text: string, { now, clipboard }: SnippetValues): string =>
  text.replaceAll(PLACEHOLDER, (_match, placeholder: string) => {
    if (placeholder === "date") {
      return formatDate(now);
    }
    if (placeholder === "time") {
      return formatTime(now);
    }
    return placeholder === "clipboard" ? clipboard : "";
  });
