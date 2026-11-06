import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { styleText } from "node:util";
import { confirm, isCancel, select } from "@clack/prompts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { rankByText } from "../../launcher/search.ts";
import { fitToWidth, padToWidth, toSplitLayout } from "../../launcher/split-view.ts";
import { isMenuBarRunning } from "../../menubar/helper.ts";
import { UTF8_ENVIRONMENT, runCommand } from "../../shell.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";
import { formatAge, formatSize, toPreview, toPreviewLines } from "./format.ts";
import { parseBmp, toBlockLines } from "./image-preview.ts";
import type { Pixels } from "./image-preview.ts";
import { clearEntries, getImagePath, getThumbnailPath, readEntries, removeEntry } from "./store.ts";
import type { ClipboardEntry, ImageEntry } from "./store.ts";

const APP_ID = "medea-clipboard-history";
const OPEN_ID = "open";
const ICON = styleText("green", "≡");
const FALLBACK_COLUMNS = 80;
// Room for the focus marker and the margins, when there's no preview beside the list.
const ROW_MARGIN = 8;
// The longest age, like "12d", and the gap before it.
const AGE_WIDTH = 5;
const MENU_PREVIEW_LENGTH = 60;
// Search stays quick on long entries, and a match this deep wouldn't be visible anyway.
const MAX_SEARCH_LENGTH = 2000;
const COPY_IMAGE_SCRIPT = `on run argv
  set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)
end run`;
const COPY = "copy";
const VIEW = "view";
const DELETE = "delete";
const DELETE_ALL = "delete-all";

const copyText = async (text: string): Promise<void> => {
  const copier = spawn("pbcopy", { env: UTF8_ENVIRONMENT, stdio: ["pipe", "ignore", "ignore"] });
  copier.stdin.end(text);
  const [exitCode] = await once(copier, "close");
  if (exitCode !== 0) {
    throw new Error("Could not copy that entry");
  }
};

const copyImage = async ({ hash }: ImageEntry): Promise<void> => {
  await runCommand("osascript", ["-e", COPY_IMAGE_SCRIPT, getImagePath(hash)]);
};

const describeEntry = (entry: ClipboardEntry, width: number): string =>
  entry.kind === "text"
    ? toPreview(entry.text, width)
    : fitToWidth(`Image ${entry.width}×${entry.height}`, width);

const toOption = (entry: ClipboardEntry, labelWidth: number, now: number): LauncherOption => {
  const descriptionWidth = labelWidth - AGE_WIDTH;
  const description = padToWidth(describeEntry(entry, descriptionWidth), descriptionWidth);
  const age = padToWidth(formatAge(entry.copiedAt, now), AGE_WIDTH - 1);
  return {
    value: entry.id,
    name:
      entry.kind === "text"
        ? entry.text.slice(0, MAX_SEARCH_LENGTH)
        : describeEntry(entry, MAX_SEARCH_LENGTH),
    aliases: [],
    label: `${description} ${styleText("gray", age)}`,
  };
};

const readThumbnail = (hash: string): Pixels | undefined => {
  try {
    return parseBmp(readFileSync(getThumbnailPath(hash)));
  } catch {
    return undefined;
  }
};

const toImagePreviewLines = (entry: ImageEntry, width: number, height: number): string[] => {
  const caption = styleText("dim", `${entry.width}×${entry.height}  ${formatSize(entry.bytes)}`);
  const pixels = readThumbnail(entry.hash);
  if (pixels === undefined) {
    return [styleText("dim", "No preview"), caption];
  }
  return [...toBlockLines(pixels, width, height - 1), caption];
};

const toEntryPreview = (entry: ClipboardEntry, width: number, height: number): string[] =>
  entry.kind === "text"
    ? toPreviewLines(entry.text, width, height)
    : toImagePreviewLines(entry, width, height);

const copyEntry = async (entry: ClipboardEntry): Promise<string> => {
  await (entry.kind === "text" ? copyText(entry.text) : copyImage(entry));
  return `Copied ${describeEntry(entry, MENU_PREVIEW_LENGTH)}`;
};

// Less shows escape codes as visible text, so copied text can't run them here.
const viewText = async (text: string): Promise<void> => {
  const pager = spawn("less", ["-S", "-Ps(q to go back)"], {
    env: { ...UTF8_ENVIRONMENT, LESSCHARSET: "utf-8", LESSSECURE: "1" },
    stdio: ["pipe", "inherit", "inherit"],
  });
  // Quitting before less has read everything closes the pipe, which is fine.
  pager.stdin.on("error", () => {});
  pager.stdin.end(text);
  await once(pager, "close");
};

const viewEntry = async (entry: ClipboardEntry): Promise<void> => {
  if (entry.kind === "text") {
    await viewText(entry.text);
    return;
  }
  await runCommand("open", [getImagePath(entry.hash)]);
};

const confirmDeleteAll = async (): Promise<boolean> => {
  const answer = await confirm({ message: "Delete all clipboard history?", initialValue: false });
  return answer === true;
};

/** Returns a line to show when finished, or undefined to go back to the list. */
const runEntryActions = async (entry: ClipboardEntry): Promise<string | undefined> => {
  drawScreen();
  const choice = await select({
    message: describeEntry(entry, MENU_PREVIEW_LENGTH),
    options: [
      { value: COPY, label: "Copy" },
      { value: VIEW, label: entry.kind === "text" ? "View full text" : "Open image" },
      { value: DELETE, label: "Delete" },
      { value: DELETE_ALL, label: "Delete all" },
    ],
  });
  if (isCancel(choice)) {
    return undefined;
  }
  if (choice === COPY) {
    return copyEntry(entry);
  }
  if (choice === VIEW) {
    await viewEntry(entry);
    return undefined;
  }
  if (choice === DELETE) {
    await removeEntry(entry.id);
    return undefined;
  }
  if (await confirmDeleteAll()) {
    await clearEntries();
    return "Clipboard history deleted";
  }
  return undefined;
};

const describeEmptyHistory = async (): Promise<string> =>
  (await isMenuBarRunning())
    ? "Nothing copied yet"
    : "Clipboard history needs the menu bar item, so add it first";

/** Shows the list once. Returns a line to show when finished, or undefined to show it again. */
const runHistoryRound = async (): Promise<string | undefined> => {
  const entries = await readEntries();
  if (entries.length === 0) {
    return describeEmptyHistory();
  }
  drawScreen();
  const now = Date.now();
  const columns = process.stdout.columns ?? FALLBACK_COLUMNS;
  const layout = toSplitLayout(columns, process.stdout.rows);
  const labelWidth = layout?.listWidth ?? columns - ROW_MARGIN;
  const options = entries.map((entry) => toOption(entry, labelWidth, now));
  const previews = new Map<string, string[]>();

  // Each arrow key redraws the screen, so an entry's preview is only worked out once.
  const renderPreview = (entryId: string, width: number, height: number): string[] => {
    const known = previews.get(entryId);
    const entry = entries.find(({ id }) => id === entryId);
    if (known !== undefined || entry === undefined) {
      return known ?? [];
    }
    const lines = toEntryPreview(entry, width, height);
    previews.set(entryId, lines);
    return lines;
  };

  const { cancelled, value, wantsSettings } = await promptForSelection(
    () => options,
    "Search clipboard",
    {
      listWhenEmpty: true,
      rank: rankByText,
      enterLabel: "copy",
      settingsLabel: "actions",
      renderPreview,
    },
  );
  const entry = entries.find(({ id }) => id === value);
  if (cancelled || entry === undefined) {
    return "";
  }
  return wantsSettings ? runEntryActions(entry) : copyEntry(entry);
};

const browseHistory = async (): Promise<string> => {
  let notice = await runHistoryRound();
  while (notice === undefined) {
    notice = await runHistoryRound();
  }
  return notice;
};

const openItem: LauncherItem = {
  value: `${APP_ID}:${OPEN_ID}`,
  name: "Clipboard (Medea)",
  icon: ICON,
  kind: "Command",
  needsWindow: true,
  run: browseHistory,
};

export const clipboardHistory: MedeaApp = {
  id: APP_ID,
  listItems: () => [openItem],
  listSettingsActions: () => [],
};
