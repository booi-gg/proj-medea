import { PassThrough } from "node:stream";
import { styleText } from "node:util";
import { AutocompletePrompt, isCancel } from "@clack/core";
import { rankItems } from "./search.ts";
import { joinColumns, toSplitLayout } from "./split-view.ts";
import type { SplitLayout } from "./split-view.ts";

const MAX_VISIBLE_RESULTS = 8;
const ENTER_KEY = "\r";
const TAB_KEY = "\t";
// Ghostty sends the first by default. The second is the kitty keyboard protocol's form.
const SHIFT_ENTER_KEYS = ["\u001B[27;2;13~", "\u001B[13;2u"];
const SETTINGS_KEYS = [TAB_KEY, ...SHIFT_ENTER_KEYS];
// Terminal sends the same bytes for Shift+Enter and Enter, so Tab is the key that always works.
const SETTINGS_KEY_HINT = process.env.TERM_PROGRAM === "ghostty" ? "⇧↵" : "tab";
const SEARCH_ICON = styleText("cyan", "❯");
const FOCUS_ICON = styleText("cyan", "▸");
const EMPTY_INPUT_CURSOR = "█";
// Same line count as the search bar: clack crashes when a redraw has fewer lines than it expects.
const BLANK_FRAME = "\n";
const PREVIEW_DIVIDER = styleText("dim", "│");
// The prompt only redraws on a key. This one types nothing and moves nothing.
const REDRAW_KEY = "\u0018";

export interface LauncherOption {
  value: string;
  name: string;
  aliases: readonly string[];
  label: string;
}

export interface Selection {
  cancelled: boolean;
  value: string | undefined;
  wantsSettings: boolean;
  query: string;
}

type Rank = (query: string, options: readonly LauncherOption[]) => LauncherOption[];
type RenderPreview = (value: string, width: number, height: number) => readonly string[];

/** A key that acts on the focused result without leaving the list. */
export interface ExtraKey {
  /** What terminals send for this key. Never a printable one, because those are search text. */
  keys: readonly string[];
  hint: string;
  /** The footer's label for a result, or undefined to leave the key to the search bar. */
  getLabel: (value: string | undefined) => string | undefined;
  run: () => void;
}

export interface SelectionDisplay {
  /** Lists results before anything is typed. */
  listWhenEmpty?: boolean;
  rank?: Rank;
  enterLabel?: string;
  settingsLabel?: string;
  /** Shows the focused result in a pane beside the list. */
  renderPreview?: RenderPreview;
  /** Called with the focused result's value, and undefined when nothing is focused. */
  onFocus?: (value: string | undefined) => void;
  extraKey?: ExtraKey;
  /** Ends the prompt early, so the caller can show it again with fresh options. */
  signal?: AbortSignal;
  /** True when nothing is lost by leaving, so a hotkey may switch this list for its own item. */
  replaceable?: boolean;
  initialQuery?: string;
}

let closeOpenList: (() => void) | undefined;

/** Ends a replaceable list as if Esc was pressed. Returns false when none is open. */
export const closeReplaceableList = (): boolean => {
  closeOpenList?.();
  return closeOpenList !== undefined;
};

const isEmptyQuery = (query: string): boolean => query.trim() === "";

const renderSearchBar = (query: string, inputWithCursor: string, placeholder: string): string => {
  const content =
    query === "" ? `${EMPTY_INPUT_CURSOR}${styleText("dim", placeholder)}` : inputWithCursor;
  return `\n  ${SEARCH_ICON} ${content}`;
};

const renderRows = (
  results: readonly LauncherOption[],
  cursor: number,
  maxRows: number,
): string[] => {
  const firstVisible = Math.max(0, cursor - maxRows + 1);
  return results.slice(firstVisible, firstVisible + maxRows).map((item) => {
    const isFocused = item === results[cursor];
    return isFocused ? `  ${FOCUS_ICON} ${item.label}` : `    ${styleText("dim", item.label)}`;
  });
};

interface ResultsDisplay {
  footer: string;
  layout: SplitLayout | undefined;
  renderPreview: RenderPreview | undefined;
}

const renderResults = (
  results: readonly LauncherOption[],
  cursor: number,
  { footer, layout, renderPreview }: ResultsDisplay,
): string => {
  if (results.length === 0) {
    return `\n\n    ${styleText("dim", "No results")}`;
  }
  const focused = results[cursor];
  const canSplit = layout !== undefined && renderPreview !== undefined && focused !== undefined;
  const rows = canSplit
    ? joinColumns(
        renderRows(results, cursor, layout.height),
        renderPreview(focused.value, layout.previewWidth, layout.height),
        layout,
        PREVIEW_DIVIDER,
      )
    : renderRows(results, cursor, MAX_VISIBLE_RESULTS);
  return `\n\n${rows.join("\n")}\n\n    ${styleText("dim", footer)}`;
};

/**
 * Returns the text before a settings key, or undefined when there is no settings key. Keys pressed
 * quickly can arrive in one read, so the key may not be alone.
 */
export const readTextBeforeSettingsKey = (keys: string): string | undefined => {
  const positions = SETTINGS_KEYS.map((key) => keys.indexOf(key)).filter((index) => index >= 0);
  return positions.length === 0 ? undefined : keys.slice(0, Math.min(...positions));
};

/**
 * Node can't parse the Shift+Enter sequences, so keys are read here first. A settings key becomes
 * a normal Enter for the prompt, with a note that settings were asked for.
 */
const readKeysInto = (
  input: PassThrough,
  onSettingsKey: () => void,
  runExtraKey: (keys: string) => boolean,
): (() => void) => {
  const forwardKey = (chunk: Buffer): void => {
    if (runExtraKey(chunk.toString())) {
      input.write(REDRAW_KEY);
      return;
    }
    const textBeforeKey = readTextBeforeSettingsKey(chunk.toString());
    if (textBeforeKey === undefined) {
      input.write(chunk);
      return;
    }
    onSettingsKey();
    input.write(`${textBeforeKey}${ENTER_KEY}`);
  };
  process.stdin.setRawMode(true);
  process.stdin.on("data", forwardKey);
  // A paused stream stays paused when a listener is added, and the process would then exit.
  process.stdin.resume();

  return () => {
    process.stdin.off("data", forwardKey);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
};

const toFooter = (baseFooter: string, extraKey: ExtraKey | undefined, value?: string): string => {
  const label = extraKey?.getLabel(value);
  return label === undefined ? baseFooter : `${baseFooter}   ${extraKey?.hint} ${label}`;
};

/** A bare search bar. Results only appear once something has been typed. */
export const promptForSelection = async (
  getOptions: () => readonly LauncherOption[],
  placeholder: string,
  {
    listWhenEmpty = false,
    rank = rankItems,
    enterLabel = "open",
    settingsLabel = "settings",
    renderPreview,
    onFocus,
    extraKey,
    signal,
    replaceable = false,
    initialQuery = "",
  }: SelectionDisplay = {},
): Promise<Selection> => {
  const baseFooter = `↵ ${enterLabel}   ${SETTINGS_KEY_HINT} ${settingsLabel}`;
  const layout = toSplitLayout(process.stdout.columns, process.stdout.rows);
  let lastQuery = initialQuery;
  let wantsSettings = false;
  let focusedValue: string | undefined;
  const input = new PassThrough();

  const runExtraKey = (keys: string): boolean => {
    const isAvailable = extraKey?.getLabel(focusedValue) !== undefined;
    if (!isAvailable || !extraKey?.keys.includes(keys)) {
      return false;
    }
    extraKey.run();
    return true;
  };
  const replacement = new AbortController();
  if (replaceable) {
    closeOpenList = () => {
      replacement.abort();
    };
  }

  const prompt = new AutocompletePrompt<LauncherOption>({
    input,
    initialUserInput: initialQuery,
    signal:
      signal === undefined ? replacement.signal : AbortSignal.any([signal, replacement.signal]),
    // rankItems has already chosen the results, so clack's own filter must not remove any.
    filter: () => true,
    options() {
      // Clack keeps focus on the old item while it stays listed. Enter must pick the top result.
      if (this.userInput !== lastQuery) {
        lastQuery = this.userInput;
        this.focusedValue = undefined;
      }
      if (isEmptyQuery(this.userInput)) {
        return listWhenEmpty ? [...getOptions()] : [];
      }
      return rank(this.userInput, getOptions());
    },
    render() {
      if (this.state === "submit" || this.state === "cancel") {
        onFocus?.(undefined);
        return BLANK_FRAME;
      }
      focusedValue = this.filteredOptions[this.cursor]?.value;
      onFocus?.(focusedValue);
      const searchBar = renderSearchBar(this.userInput, this.userInputWithCursor, placeholder);
      if (isEmptyQuery(this.userInput) && !listWhenEmpty) {
        return searchBar;
      }
      const results = renderResults(this.filteredOptions, this.cursor, {
        footer: toFooter(baseFooter, extraKey, focusedValue),
        layout,
        renderPreview,
      });
      return `${searchBar}${results}`;
    },
  });

  const stopReadingKeys = readKeysInto(
    input,
    () => {
      wantsSettings = true;
    },
    runExtraKey,
  );
  try {
    const result = await prompt.prompt();
    if (isCancel(result)) {
      return { cancelled: true, value: undefined, wantsSettings: false, query: lastQuery };
    }
    return {
      cancelled: false,
      value: typeof result === "string" ? result : undefined,
      wantsSettings,
      query: lastQuery,
    };
  } finally {
    stopReadingKeys();
    if (replaceable) {
      closeOpenList = undefined;
    }
  }
};
