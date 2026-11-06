import { PassThrough } from "node:stream";
import { styleText } from "node:util";
import { AutocompletePrompt, isCancel } from "@clack/core";
import { rankItems } from "./search.ts";

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
}

const isEmptyQuery = (query: string): boolean => query.trim() === "";

const renderSearchBar = (query: string, inputWithCursor: string, placeholder: string): string => {
  const content =
    query === "" ? `${EMPTY_INPUT_CURSOR}${styleText("dim", placeholder)}` : inputWithCursor;
  return `\n  ${SEARCH_ICON} ${content}`;
};

const renderResults = (results: readonly LauncherOption[], cursor: number): string => {
  if (results.length === 0) {
    return `\n\n    ${styleText("dim", "No results")}`;
  }
  const firstVisible = Math.max(0, cursor - MAX_VISIBLE_RESULTS + 1);
  const rows = results.slice(firstVisible, firstVisible + MAX_VISIBLE_RESULTS).map((item) => {
    const isFocused = item === results[cursor];
    return isFocused ? `  ${FOCUS_ICON} ${item.label}` : `    ${styleText("dim", item.label)}`;
  });
  const hint = styleText("dim", `↵ open   ${SETTINGS_KEY_HINT} settings`);
  return `\n\n${rows.join("\n")}\n\n    ${hint}`;
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
const readKeysInto = (input: PassThrough, onSettingsKey: () => void): (() => void) => {
  const forwardKey = (chunk: Buffer): void => {
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

/** A bare search bar. Results only appear once something has been typed. */
export const promptForSelection = async (
  getOptions: () => readonly LauncherOption[],
  placeholder: string,
): Promise<Selection> => {
  let lastQuery = "";
  let wantsSettings = false;
  const input = new PassThrough();

  const prompt = new AutocompletePrompt<LauncherOption>({
    input,
    // rankItems has already chosen the results, so clack's own filter must not remove any.
    filter: () => true,
    options() {
      // Clack keeps focus on the old item while it stays listed. Enter must pick the top result.
      if (this.userInput !== lastQuery) {
        lastQuery = this.userInput;
        this.focusedValue = undefined;
      }
      return isEmptyQuery(this.userInput) ? [] : rankItems(this.userInput, getOptions());
    },
    render() {
      if (this.state === "submit" || this.state === "cancel") {
        return BLANK_FRAME;
      }
      const searchBar = renderSearchBar(this.userInput, this.userInputWithCursor, placeholder);
      if (isEmptyQuery(this.userInput)) {
        return searchBar;
      }
      return `${searchBar}${renderResults(this.filteredOptions, this.cursor)}`;
    },
  });

  const stopReadingKeys = readKeysInto(input, () => {
    wantsSettings = true;
  });
  try {
    const result = await prompt.prompt();
    if (isCancel(result)) {
      return { cancelled: true, value: undefined, wantsSettings: false };
    }
    return {
      cancelled: false,
      value: typeof result === "string" ? result : undefined,
      wantsSettings,
    };
  } finally {
    stopReadingKeys();
  }
};
