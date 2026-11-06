import { spawn } from "node:child_process";
import { once } from "node:events";
import { styleText } from "node:util";
import { confirm, isCancel, select } from "@clack/prompts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { rankByText } from "../../launcher/search.ts";
import { isMenuBarRunning } from "../../menubar/helper.ts";
import { UTF8_ENVIRONMENT } from "../../shell.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";
import { formatAge, toPreview } from "./format.ts";
import { clearEntries, readEntries, removeEntry } from "./store.ts";
import type { ClipboardEntry } from "./store.ts";

const APP_ID = "medea-clipboard-history";
const OPEN_ID = "open";
const ICON = styleText("green", "≡");
const FALLBACK_COLUMNS = 80;
// Room for the focus marker, the gap and the age.
const ROW_MARGIN = 14;
const MIN_PREVIEW_LENGTH = 20;
const MENU_PREVIEW_LENGTH = 60;
// Search stays quick on long entries, and a match this deep wouldn't be visible anyway.
const MAX_SEARCH_LENGTH = 2000;
const COPY = "copy";
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

const toOption = (entry: ClipboardEntry, now: number): LauncherOption => {
  const columns = process.stdout.columns ?? FALLBACK_COLUMNS;
  const previewLength = Math.max(MIN_PREVIEW_LENGTH, columns - ROW_MARGIN);
  const preview = toPreview(entry.text, previewLength).padEnd(previewLength);
  return {
    value: entry.id,
    name: entry.text.slice(0, MAX_SEARCH_LENGTH),
    aliases: [],
    label: `${preview}  ${styleText("gray", formatAge(entry.copiedAt, now))}`,
  };
};

const copyEntry = async ({ text }: ClipboardEntry): Promise<string> => {
  await copyText(text);
  return `Copied ${toPreview(text, MENU_PREVIEW_LENGTH)}`;
};

const confirmDeleteAll = async (): Promise<boolean> => {
  const answer = await confirm({ message: "Delete all clipboard history?", initialValue: false });
  return answer === true;
};

/** Returns a line to show when finished, or undefined to go back to the list. */
const runEntryActions = async (entry: ClipboardEntry): Promise<string | undefined> => {
  drawScreen();
  const choice = await select({
    message: toPreview(entry.text, MENU_PREVIEW_LENGTH),
    options: [
      { value: COPY, label: "Copy" },
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
  const options = entries.map((entry) => toOption(entry, now));
  const { cancelled, value, wantsSettings } = await promptForSelection(
    () => options,
    "Search clipboard",
    { listWhenEmpty: true, rank: rankByText, enterLabel: "copy", settingsLabel: "actions" },
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
  name: "Clipboard History",
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
