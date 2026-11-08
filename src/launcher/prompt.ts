import { PassThrough } from "node:stream";
import { styleText } from "node:util";
import { AutocompletePrompt, isCancel } from "@clack/core";
import { rankItems } from "./search.ts";
import { joinColumns, toSplitLayout } from "./split-view.ts";
import type { SplitLayout } from "./split-view.ts";

const MAX_VISIBLE_RESULTS = 8;
const ENTER_KEY = "\r";
const TAB_KEY = "\t";
// Shift+Enter from terminals that tell it apart, read so it never types junk into search. The first
// is xterm's form, the second the kitty keyboard protocol's.
const SHIFT_ENTER_KEYS = ["\u001B[27;2;13~", "\u001B[13;2u"];
const SETTINGS_KEYS = [TAB_KEY, ...SHIFT_ENTER_KEYS];
// Terminal sends the same bytes for Shift+Enter and Enter, so Tab is the key that always works.
const SETTINGS_KEY_HINT = "tab";
const SEARCH_ICON = styleText("white", "❯");
const FOCUS_ICON = styleText("white", "▸");
const END_OF_TEXT_CURSOR = "█";
// Same line count as the search bar: clack crashes when a redraw has fewer lines than it expects.
const BLANK_FRAME = "\n";
const PREVIEW_DIVIDER = styleText("dim", "│");
// The prompt only redraws on a key. This one types nothing and moves nothing.
const REDRAW_KEY = "\u0018";
// Never typed, so the options always count as changed.
const REFRESH_TEXT = "\0";
const NO_RESULTS_TEXT = "No results";
// Sets a line of text apart from the result under it.
const INERT_ROW_GAP = "\n";
// Clack only needs this to be something. It's never shown.
const NOT_CHOOSABLE = "not-choosable";

export interface LauncherOption {
  value: string;
  name: string;
  aliases: readonly string[];
  label: string;
  /** Replaces the list's key hints while this result is focused. */
  footer?: string;
  /** A line of text and not a result. Focus can rest here, showing no marker, and Enter does nothing. */
  isInert?: boolean;
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
  maxVisibleResults?: number;
  rank?: Rank;
  enterLabel?: string;
  settingsLabel?: string;
  /** Shows the focused result in a pane beside the list. */
  renderPreview?: RenderPreview;
  /** Called with the focused result's value, and undefined when nothing is focused. */
  onFocus?: (value: string | undefined) => void;
  /** Called with the search text each time it changes. */
  onQueryChange?: (query: string) => void;
  /** Shown instead of "No results", for when there may be some on the way. */
  getEmptyText?: () => string;
  /** Receives a function that shows new options, for results that arrive after a keystroke. */
  watchOptions?: (refresh: () => void) => () => void;
  extraKeys?: readonly ExtraKey[];
  /** Ends the prompt early, so the caller can show it again with fresh options. */
  signal?: AbortSignal;
  /** True when nothing is lost by leaving, so a hotkey may switch this list for its own item. */
  replaceable?: boolean;
  initialQuery?: string;
  /** The result to focus when the list opens with initialQuery, instead of the top one. */
  initialFocus?: string | undefined;
  /** Replaces the search arrow when the query activates a special action. */
  getSearchIcon?: (query: string) => string | undefined;
}

let closeOpenList: (() => void) | undefined;

/** Ends a replaceable list as if Esc was pressed. Returns false when none is open. */
export const closeReplaceableList = (): boolean => {
  closeOpenList?.();
  return closeOpenList !== undefined;
};

const isEmptyQuery = (query: string): boolean => query.trim() === "";

/** Shows the cursor on the character at this position, or after the last one. */
export const drawTextCursor = (text: string, position: number): string => {
  // Destructuring takes a whole character, where slicing one unit would split an emoji in two.
  const [character] = text.slice(position);
  if (character === undefined) {
    return `${text}${END_OF_TEXT_CURSOR}`;
  }
  const before = text.slice(0, position);
  const after = text.slice(position + character.length);
  return `${before}${styleText("inverse", character)}${after}`;
};

// Clack draws the cursor at the focused result's index, so the arrow keys seemed to do nothing.
class SearchPrompt extends AutocompletePrompt<LauncherOption> {
  override get userInputWithCursor(): string {
    return drawTextCursor(this.userInput, this._cursor);
  }

  /** Clack only reads the options again when the text changes. Focus stays on the same result. */
  refreshOptions(): void {
    this.emit("userInput", REFRESH_TEXT);
    this.emit("userInput", this.userInput);
  }
}

const renderSearchBar = (
  query: string,
  inputWithCursor: string,
  placeholder: string,
  icon = SEARCH_ICON,
): string => {
  const content =
    query === "" ? `${END_OF_TEXT_CURSOR}${styleText("dim", placeholder)}` : inputWithCursor;
  return `\n  ${icon} ${content}`;
};

const renderRows = (
  results: readonly LauncherOption[],
  cursor: number,
  maxRows: number,
): string[] => {
  const firstVisible = Math.max(0, cursor - maxRows + 1);
  return results.slice(firstVisible, firstVisible + maxRows).map((item) => {
    if (item.isInert === true) {
      return `    ${styleText("dim", item.label)}${INERT_ROW_GAP}`;
    }
    const isFocused = item === results[cursor];
    return isFocused ? `  ${FOCUS_ICON} ${item.label}` : `    ${styleText("dim", item.label)}`;
  });
};

interface ResultsDisplay {
  footer: string;
  maxRows: number;
  layout: SplitLayout | undefined;
  renderPreview: RenderPreview | undefined;
  emptyText: string;
}

const renderResults = (
  results: readonly LauncherOption[],
  cursor: number,
  { footer, maxRows, layout, renderPreview, emptyText }: ResultsDisplay,
): string => {
  if (results.length === 0) {
    return `\n\n    ${styleText("dim", emptyText)}`;
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
    : renderRows(results, cursor, maxRows);
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

const toFooter = (baseFooter: string, extraKeys: readonly ExtraKey[], value?: string): string => {
  const hints = extraKeys.flatMap((key) => {
    const label = key.getLabel(value);
    return label === undefined ? [] : [`${key.hint} ${label}`];
  });
  return [baseFooter, ...hints].join("   ");
};

/** A bare search bar. Results only appear once something has been typed. */
export const promptForSelection = async (
  getOptions: () => readonly LauncherOption[],
  placeholder: string,
  {
    listWhenEmpty = false,
    maxVisibleResults = MAX_VISIBLE_RESULTS,
    rank = rankItems,
    enterLabel = "open",
    settingsLabel = "settings",
    renderPreview,
    onFocus,
    onQueryChange,
    getEmptyText = () => NO_RESULTS_TEXT,
    watchOptions,
    extraKeys = [],
    signal,
    replaceable = false,
    initialQuery = "",
    initialFocus,
    getSearchIcon,
  }: SelectionDisplay = {},
): Promise<Selection> => {
  const baseFooter = `↵ ${enterLabel}   ${SETTINGS_KEY_HINT} ${settingsLabel}`;
  const layout = toSplitLayout(process.stdout.columns, process.stdout.rows);
  let lastQuery = initialQuery;
  let wantsSettings = false;
  let focusedValue: string | undefined;
  let isFocusInert = false;
  // Clack reads the options once while it's being built, before the first text is in place.
  let isOpen = false;
  let focusToRestore = initialFocus;
  const input = new PassThrough();

  const runExtraKey = (keys: string): boolean => {
    const extraKey = extraKeys.find(
      (key) => key.keys.includes(keys) && key.getLabel(focusedValue) !== undefined,
    );
    extraKey?.run();
    return extraKey !== undefined;
  };
  const replacement = new AbortController();
  if (replaceable) {
    closeOpenList = () => {
      replacement.abort();
    };
  }

  const prompt = new SearchPrompt({
    input,
    initialUserInput: initialQuery,
    // With no text there's no change for the options callback to restore the focus on.
    ...(initialFocus === undefined ? {} : { initialValue: [initialFocus] }),
    signal:
      signal === undefined ? replacement.signal : AbortSignal.any([signal, replacement.signal]),
    // rankItems has already chosen the results, so clack's own filter must not remove any.
    filter: () => true,
    // Refusing here also covers Enter arriving in one read with the text typed before it.
    validate: () => (isFocusInert ? NOT_CHOOSABLE : undefined),
    options() {
      // Clack keeps focus on the old item while it stays listed. Enter must pick the top result.
      if (this.userInput !== lastQuery) {
        lastQuery = this.userInput;
        const isOpeningText = isOpen && this.userInput === initialQuery;
        this.focusedValue = isOpeningText ? focusToRestore : undefined;
        if (isOpen) {
          focusToRestore = undefined;
          onQueryChange?.(this.userInput);
        }
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
      const focused = this.filteredOptions[this.cursor];
      focusedValue = focused?.value;
      isFocusInert = focused?.isInert === true;
      onFocus?.(focusedValue);
      const searchBar = renderSearchBar(
        this.userInput,
        this.userInputWithCursor,
        placeholder,
        getSearchIcon?.(this.userInput),
      );
      if (isEmptyQuery(this.userInput) && !listWhenEmpty) {
        return searchBar;
      }
      const results = renderResults(this.filteredOptions, this.cursor, {
        footer: focused?.footer ?? toFooter(baseFooter, extraKeys, focusedValue),
        maxRows: maxVisibleResults,
        layout,
        renderPreview,
        emptyText: getEmptyText(),
      });
      return `${searchBar}${results}`;
    },
  });

  const stopReadingKeys = readKeysInto(
    input,
    () => {
      // The Enter that follows is refused, so it mustn't count against the next one.
      wantsSettings = !isFocusInert;
    },
    runExtraKey,
  );
  const stopWatchingOptions = watchOptions?.(() => {
    prompt.refreshOptions();
    input.write(REDRAW_KEY);
  });
  isOpen = true;
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
    stopWatchingOptions?.();
    stopReadingKeys();
    if (replaceable) {
      closeOpenList = undefined;
    }
  }
};
