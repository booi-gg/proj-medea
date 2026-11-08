import { stripVTControlCharacters } from "node:util";
import { runCommand } from "../shell.ts";
import { sendHelperRequest } from "./helper-socket.ts";

// More than the panel's three lines show, and small enough to fit the helper's socket.
const MAX_TITLE_CHARACTERS = 60;
const MAX_MESSAGE_CHARACTERS = 200;
const OK_REPLY = "ok";
const CONTROL_CHARACTERS = /\p{Cc}+/gu;
const REPEATED_SPACES = / {2,}/gu;
const ELLIPSIS = "…";
const characterSegmenter = new Intl.Segmenter();

const FALLBACK_SCRIPT = `on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run`;

export interface Notice {
  title: string;
  message: string;
  isError?: boolean;
}

// Whole characters are counted, so a long message can't be cut through the middle of an emoji.
const toPlainLine = (text: string, maxCharacters: number): string => {
  const plain = stripVTControlCharacters(text)
    .replaceAll(CONTROL_CHARACTERS, " ")
    .replaceAll(REPEATED_SPACES, " ")
    .trim();
  const characters = Array.from(characterSegmenter.segment(plain), ({ segment }) => segment);
  return characters.length <= maxCharacters
    ? plain
    : `${characters.slice(0, maxCharacters - 1).join("")}${ELLIPSIS}`;
};

/** The socket reads one line, so the text travels encoded. */
export const encodeNotice = ({ title, message, isError = false }: Notice): string => {
  const json = JSON.stringify({
    title: toPlainLine(title, MAX_TITLE_CHARACTERS),
    message: toPlainLine(message, MAX_MESSAGE_CHARACTERS),
    isError,
  });
  return Buffer.from(json).toString("base64");
};

export const toNoticeRequest = (notice: Notice): string => `notice ${encodeNotice(notice)}`;

/**
 * Shows Redhot's notification. Use this for anything that happens with no window to show it in.
 * Falls back to a macOS notification when the helper isn't running. Never throws.
 */
export const showNotice = async (notice: Notice): Promise<void> => {
  try {
    if ((await sendHelperRequest(toNoticeRequest(notice))) === OK_REPLY) {
      return;
    }
    await runCommand("osascript", ["-e", FALLBACK_SCRIPT, notice.title, notice.message]);
  } catch {
    // Only the notification failed. Whatever it was reporting has already happened.
  }
};
