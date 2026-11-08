import { promptForSelection } from "../../launcher/prompt.ts";
import type { ExtraKey, LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen, fitToColumns, toTerminalWidth } from "../../launcher/screen.ts";
import { askForWindowAccess, pasteIntoPreviousApp } from "../../menubar/helper-socket.ts";
import { copyText } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp, RunContext } from "../types.ts";
import { parseEmojiData, rankEmoji, withRecentsFirst } from "./catalog.ts";
import type { EmojiEntry } from "./catalog.ts";
import { readRecentsSync, rememberPick } from "./recents.ts";

const APP_ID = "redhot-emoji";
const OPEN_ID = "open";
const NAME = "Search Emoji & Symbols";
const ICON = toRedhotIcon("☺");
const CTRL_V = "\u0016";
const PASTE_KEY_HINT = "^V";
const FOOTER = `↵ copy   ${PASTE_KEY_HINT} paste`;
const FALLBACK_COLUMNS = 80;
const FALLBACK_ROWS = 24;
// Room for the focus marker and the margins.
const ROW_MARGIN = 8;
// Two columns for the widest emoji, and at least one before the name.
const CHARACTER_COLUMN_WIDTH = 3;

interface ListState {
  query: string;
  notice: string;
  focused: string | undefined;
}

interface Round extends ListState {
  isFinished: boolean;
}

interface Session {
  entries: readonly EmojiEntry[];
  maxRows: number;
  closesWhenDone: boolean;
}

const toOption = ({ character, name, keywords }: EmojiEntry, width: number): LauncherOption => {
  const gap = " ".repeat(Math.max(1, CHARACTER_COLUMN_WIDTH - toTerminalWidth(character)));
  return {
    value: character,
    name,
    aliases: keywords,
    label: `${character}${gap}${fitToColumns(name, width - CHARACTER_COLUMN_WIDTH)}`,
    footer: FOOTER,
  };
};

const copyPick = async ({ character }: EmojiEntry): Promise<void> => {
  await copyText(character);
  await rememberPick(character);
};

/** Returns why the paste didn't happen, or undefined when it did. Either way it's been copied. */
const pastePick = async (entry: EmojiEntry): Promise<string | undefined> => {
  await copyPick(entry);
  const result = await pasteIntoPreviousApp();
  const copied = `Copied ${entry.character}.`;
  if (result === "no-access") {
    await askForWindowAccess();
    return `${copied} Turn on redhot-status under Accessibility to paste`;
  }
  if (result === "no-app") {
    return `${copied} There's no other app to paste into yet`;
  }
  return result === "no-helper"
    ? `${copied} To paste, add or restart the menu bar item`
    : undefined;
};

/** Shows the list once. */
const runRound = async (
  { entries, maxRows, closesWhenDone }: Session,
  { query: initialQuery, notice, focused: initialFocus }: ListState,
): Promise<Round> => {
  drawScreen({ title: NAME, icon: ICON, notice });
  const width = (process.stdout.columns ?? FALLBACK_COLUMNS) - ROW_MARGIN;
  const options = withRecentsFirst(entries, readRecentsSync()).map((entry) =>
    toOption(entry, width),
  );
  // The prompt clears its focus as it closes, so the key has to note the row when it's pressed.
  let focused: string | undefined;
  let pasteTarget: string | undefined;
  const keyPressed = new AbortController();
  const pasteKey: ExtraKey = {
    keys: [CTRL_V],
    hint: PASTE_KEY_HINT,
    getLabel: (value) => (value === undefined ? undefined : "paste"),
    run: () => {
      pasteTarget = focused;
      keyPressed.abort();
    },
  };

  const { cancelled, value, query } = await promptForSelection(
    () => options,
    "Search emoji and symbols",
    {
      listWhenEmpty: true,
      rank: rankEmoji,
      enterLabel: "copy",
      replaceable: true,
      initialQuery,
      initialFocus,
      signal: keyPressed.signal,
      maxVisibleResults: maxRows,
      onFocus: (focusedValue) => {
        focused = focusedValue;
      },
      extraKeys: [pasteKey],
    },
  );

  const findEntry = (character: string | undefined): EmojiEntry | undefined =>
    entries.find((entry) => entry.character === character);
  const backToList = (nextNotice: string, character: string | undefined): Round => ({
    isFinished: false,
    notice: nextNotice,
    query,
    focused: character,
  });

  const toPaste = findEntry(pasteTarget);
  if (toPaste !== undefined) {
    const problem = await pastePick(toPaste);
    // Focus has gone back to the other app, so there's nobody here to read a notice.
    return problem === undefined
      ? { ...backToList("", undefined), isFinished: true }
      : backToList(problem, toPaste.character);
  }
  if (cancelled) {
    return { ...backToList("", undefined), isFinished: true };
  }
  // Enter with nothing listed has nothing to copy, so the search carries on.
  // Tab comes here too: an emoji has no settings, so it copies like Enter does.
  const picked = findEntry(value);
  if (picked === undefined) {
    return backToList("", undefined);
  }
  await copyPick(picked);
  const copied = `Copied ${picked.character} ${picked.name}`;
  return { ...backToList(copied, picked.character), isFinished: closesWhenDone };
};

// Both loaded late: 2,000 rows shouldn't slow every search window's start, and the hotkey list needs
// the registry, which loads this file.
const runEmojiSearch = async ({ closesWhenDone }: RunContext): Promise<string> => {
  const [{ EMOJI_DATA }, { toVisibleRows }] = await Promise.all([
    import("./data.ts"),
    import("../../launcher/hotkey-list.ts"),
  ]);
  const session: Session = {
    entries: parseEmojiData(EMOJI_DATA),
    maxRows: toVisibleRows(process.stdout.rows ?? FALLBACK_ROWS),
    closesWhenDone,
  };
  let round = await runRound(session, { query: "", notice: "", focused: undefined });
  while (!round.isFinished) {
    round = await runRound(session, round);
  }
  return round.notice;
};

const openItem: LauncherItem = {
  value: `${APP_ID}:${OPEN_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  hint: "Find an emoji or symbol to copy or paste",
  needsWindow: true,
  run: (context = { closesWhenDone: false }) => runEmojiSearch(context),
};

export const emoji: RedhotApp = {
  id: APP_ID,
  listItems: () => [openItem],
  listSettingsActions: () => [],
};
