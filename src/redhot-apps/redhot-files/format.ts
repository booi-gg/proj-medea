import { styleText } from "node:util";
import { homedir } from "node:os";
import { dirname, sep } from "node:path";
import stringWidth from "string-width";
import { fitToWidth } from "../../launcher/split-view.ts";
import type { FileResult } from "./search.ts";

const ELLIPSIS = "…";
const ICLOUD_DRIVE_FOLDER = "Library/Mobile Documents/com~apple~CloudDocs";
const ICLOUD_DRIVE_NAME = "iCloud Drive";
const HOME_SYMBOL = "~";
const CONTROL_CHARACTERS = /\p{Cc}/gu;
const COLUMN_GAP = "  ";
// Leaves the folder some room beside a long name.
const NAME_SHARE = 0.6;

const graphemes = new Intl.Segmenter();

/** File names come from disk, so nothing in them may run in the terminal. */
export const toSafeName = (text: string): string => text.replaceAll(CONTROL_CHARACTERS, "");

/** The file's folder, written the way a person would say it. */
export const toFolderLabel = (path: string, home: string = homedir()): string => {
  const folder = dirname(path);
  const iCloudDrive = `${home}${sep}${ICLOUD_DRIVE_FOLDER}`;
  if (folder === iCloudDrive || folder.startsWith(`${iCloudDrive}${sep}`)) {
    return `${ICLOUD_DRIVE_NAME}${folder.slice(iCloudDrive.length)}`;
  }
  if (folder === home || folder.startsWith(`${home}${sep}`)) {
    return `${HOME_SYMBOL}${folder.slice(home.length)}`;
  }
  return folder;
};

// A path's end says the most about where a file is, so its start is what gets cut.
const fitEndToWidth = (text: string, width: number): string => {
  if (stringWidth(text) <= width) {
    return text;
  }
  let fitted = "";
  let used = 0;
  for (const { segment } of [...graphemes.segment(text)].toReversed()) {
    const segmentWidth = stringWidth(segment);
    if (used + segmentWidth > width - 1) {
      break;
    }
    fitted = `${segment}${fitted}`;
    used += segmentWidth;
  }
  return `${ELLIPSIS}${fitted}`;
};

/** The name, with its shortened folder dimmed beside it, in this many columns. */
export const toFileRow = (
  { path, name }: FileResult,
  width: number,
  home: string = homedir(),
): string => {
  const nameLimit = Math.max(1, Math.floor(width * NAME_SHARE));
  const shownName = fitToWidth(toSafeName(name), nameLimit);
  const folderWidth = width - stringWidth(shownName) - COLUMN_GAP.length;
  if (folderWidth <= 0) {
    return shownName;
  }
  const folder = fitEndToWidth(toSafeName(toFolderLabel(path, home)), folderWidth);
  return `${shownName}${COLUMN_GAP}${styleText("gray", folder)}`;
};
