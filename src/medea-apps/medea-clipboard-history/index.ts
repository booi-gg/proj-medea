import { spawn } from "node:child_process";
import { trackSpawn } from "../../log.ts";
import { once } from "node:events";
import { styleText } from "node:util";
import { confirm, isCancel, select } from "@clack/prompts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { rankByText } from "../../launcher/search.ts";
import { fitToWidth, padToWidth, toSplitLayout } from "../../launcher/split-view.ts";
import { isMenuBarRunning } from "../../menubar/helper.ts";
import { UTF8_ENVIRONMENT, copyText, runCommand } from "../../shell.ts";
import { toMedeaIcon } from "../icon.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";
import { formatAge, formatSize, toPreview, toPreviewLines, toSafeText } from "./format.ts";
import { openImageWindow } from "./image-window.ts";
import type { ImageWindow } from "./image-window.ts";
import {
  clearEntries,
  getImagePath,
  readEntries,
  removeEntry,
  removeExpiredEntries,
  watchEntries,
} from "./store.ts";
import type { ClipboardEntry, ImageEntry } from "./store.ts";
import { createHighlighter } from "./syntax.ts";
import type { Highlight } from "./syntax.ts";

const APP_ID = "medea-clipboard-history";
const OPEN_ID = "open";
const ICON = toMedeaIcon("≡");
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
// Terminals send the first, or the second when an app has asked for application cursor keys.
const LEFT_ARROW_KEYS = ["\u001B[D", "\u001BOD"];
const SCREEN_TITLE = { title: "Clipboard", icon: ICON };
const COPY = "copy";
const VIEW = "view";
const DELETE = "delete";
const DELETE_ALL = "delete-all";

const copyImage = async ({ hash }: ImageEntry): Promise<void> => {
  await runCommand("osascript", ["-e", COPY_IMAGE_SCRIPT, getImagePath(hash)]);
};

const toImageSizeLabel = ({ width, height }: ImageEntry): string => `Image ${width}×${height}`;

const describeEntry = (entry: ClipboardEntry, width: number): string =>
  entry.kind === "text"
    ? toPreview(entry.text, width)
    : fitToWidth(entry.name ?? toImageSizeLabel(entry), width);

// Named images can still be found by typing "image" or their size.
const toSearchText = (entry: ClipboardEntry): string =>
  entry.kind === "text"
    ? entry.text.slice(0, MAX_SEARCH_LENGTH)
    : `${entry.name ?? ""} ${toImageSizeLabel(entry)}`.trim();

const toOption = (entry: ClipboardEntry, labelWidth: number, now: number): LauncherOption => {
  const descriptionWidth = labelWidth - AGE_WIDTH;
  const description = padToWidth(describeEntry(entry, descriptionWidth), descriptionWidth);
  const age = padToWidth(formatAge(entry.copiedAt, now), AGE_WIDTH - 1);
  return {
    value: entry.id,
    name: toSearchText(entry),
    aliases: [],
    label: `${description} ${styleText("gray", age)}`,
  };
};

interface Screen {
  highlight: Highlight;
  imageWindow: ImageWindow;
}

interface Round {
  /** A line to show when finished, or undefined to show the list again. */
  notice: string | undefined;
  query: string;
}

// The list cuts a long name short, so the pane shows all of it above these.
const toImagePreviewLines = (
  { name, width, height, bytes }: ImageEntry,
  paneWidth: number,
  paneHeight: number,
): string[] => {
  const details = [
    `${width}×${height}`,
    styleText("dim", formatSize(bytes)),
    "",
    styleText("dim", "Opens in its own window"),
  ];
  if (name === undefined) {
    return details;
  }
  const nameHeight = Math.max(paneHeight - details.length, 1);
  return [...toPreviewLines(name, paneWidth, nameHeight), ...details];
};

const toEntryPreview = (
  entry: ClipboardEntry,
  highlight: Highlight,
  width: number,
  height: number,
): string[] =>
  entry.kind === "text"
    ? toPreviewLines(entry.text, width, height, highlight)
    : toImagePreviewLines(entry, width, height);

const copyEntry = async (entry: ClipboardEntry): Promise<string> => {
  await (entry.kind === "text" ? copyText(entry.text) : copyImage(entry));
  return `Copied ${describeEntry(entry, MENU_PREVIEW_LENGTH)}`;
};

// Less needs -R to show colours, which would also run any escape codes in the copied text. So
// those are removed first, and only the highlighter's colours reach it.
const viewText = async (text: string, highlight: Highlight): Promise<void> => {
  const pager = trackSpawn(
    spawn("less", ["-RS", "-Ps(q to go back)"], {
      env: { ...UTF8_ENVIRONMENT, LESSCHARSET: "utf-8", LESSSECURE: "1" },
      stdio: ["pipe", "inherit", "inherit"],
    }),
    "less",
  );
  // Quitting before less has read everything closes the pipe, which is fine.
  pager.stdin.on("error", () => {});
  pager.stdin.end(highlight(toSafeText(text)));
  await once(pager, "close");
};

const viewEntry = async (entry: ClipboardEntry, highlight: Highlight): Promise<void> => {
  if (entry.kind === "text") {
    await viewText(entry.text, highlight);
    return;
  }
  await runCommand("open", [getImagePath(entry.hash)]);
};

const confirmDeleteAll = async (): Promise<boolean> => {
  const answer = await confirm({ message: "Delete all clipboard history?", initialValue: false });
  return answer === true;
};

/** Returns a line to show when finished, or undefined to go back to the list. */
const runEntryActions = async (
  entry: ClipboardEntry,
  highlight: Highlight,
): Promise<string | undefined> => {
  drawScreen(SCREEN_TITLE);
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
    await viewEntry(entry, highlight);
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

/** Shows the list once. A new copy ends the round, so the next one shows it straight away. */
const runHistoryRound = async (
  { highlight, imageWindow }: Screen,
  initialQuery: string,
): Promise<Round> => {
  const entries = await readEntries();
  if (entries.length === 0) {
    return { notice: await describeEmptyHistory(), query: "" };
  }
  drawScreen(SCREEN_TITLE);
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
    const lines = toEntryPreview(entry, highlight, width, height);
    previews.set(entryId, lines);
    return lines;
  };

  // Closing lasts until focus moves, so the image comes back on the next visit. Typing redraws
  // without moving focus, and must not bring it back.
  let focusedId: string | undefined;
  let closedId: string | undefined;
  const isImage = (entryId: string | undefined): boolean =>
    entries.some(({ id, kind }) => id === entryId && kind === "image");

  const historyChange = new AbortController();
  const stopWatching = watchEntries(() => {
    historyChange.abort();
  });
  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => options,
    "Search clipboard",
    {
      listWhenEmpty: true,
      rank: rankByText,
      enterLabel: "copy",
      settingsLabel: "actions",
      renderPreview,
      signal: historyChange.signal,
      replaceable: true,
      initialQuery,
      onFocus: (entryId) => {
        if (entryId !== focusedId) {
          focusedId = entryId;
          closedId = undefined;
        }
        const focused = entries.find(({ id }) => id === entryId);
        if (focused?.kind === "image" && entryId !== closedId) {
          imageWindow.show(getImagePath(focused.hash));
        } else {
          imageWindow.hide();
        }
      },
      extraKey: {
        keys: LEFT_ARROW_KEYS,
        hint: "←",
        getLabel: (entryId) =>
          isImage(entryId) && entryId !== closedId ? "close image" : undefined,
        run: () => {
          closedId = isImage(focusedId) ? focusedId : undefined;
        },
      },
    },
  );
  stopWatching();
  if (historyChange.signal.aborted) {
    return { notice: undefined, query };
  }
  const entry = entries.find(({ id }) => id === value);
  if (cancelled || entry === undefined) {
    return { notice: "", query };
  }
  const notice = await (wantsSettings ? runEntryActions(entry, highlight) : copyEntry(entry));
  return { notice, query: "" };
};

const browseHistory = async (): Promise<string> => {
  await removeExpiredEntries();
  const [highlight, imageWindow] = await Promise.all([createHighlighter(), openImageWindow()]);
  const screen = { highlight, imageWindow };
  try {
    let round = await runHistoryRound(screen, "");
    while (round.notice === undefined) {
      round = await runHistoryRound(screen, round.query);
    }
    return round.notice;
  } finally {
    imageWindow.close();
  }
};

const openItem: LauncherItem = {
  value: `${APP_ID}:${OPEN_ID}`,
  name: "Clipboard",
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
