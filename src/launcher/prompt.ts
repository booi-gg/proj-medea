import { styleText } from "node:util";
import { AutocompletePrompt } from "@clack/core";
import { rankItems } from "./search.ts";

const MAX_VISIBLE_RESULTS = 8;
const PLACEHOLDER = "Cast actions";
const SEARCH_ICON = styleText("cyan", "❯");
const FOCUS_ICON = styleText("cyan", "▸");
const EMPTY_INPUT_CURSOR = "█";
// Same line count as the search bar: clack crashes when a redraw has fewer lines than it expects.
const BLANK_FRAME = "\n";

export interface LauncherOption {
  value: string;
  name: string;
  label: string;
}

const isEmptyQuery = (query: string): boolean => query.trim() === "";

const renderSearchBar = (query: string, inputWithCursor: string): string => {
  const content =
    query === "" ? `${EMPTY_INPUT_CURSOR}${styleText("dim", PLACEHOLDER)}` : inputWithCursor;
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
  return `\n\n${rows.join("\n")}`;
};

/** A bare search bar. Results only appear once something has been typed. */
export const promptForSelection = (items: readonly LauncherOption[]) => {
  let lastQuery = "";

  const prompt = new AutocompletePrompt<LauncherOption>({
    // rankItems has already chosen the results, so clack's own filter must not remove any.
    filter: () => true,
    options() {
      // Clack keeps focus on the old item while it stays listed. Enter must pick the top result.
      if (this.userInput !== lastQuery) {
        lastQuery = this.userInput;
        this.focusedValue = undefined;
      }
      return isEmptyQuery(this.userInput) ? [] : rankItems(this.userInput, items);
    },
    render() {
      if (this.state === "submit" || this.state === "cancel") {
        return BLANK_FRAME;
      }
      const searchBar = renderSearchBar(this.userInput, this.userInputWithCursor);
      if (isEmptyQuery(this.userInput)) {
        return searchBar;
      }
      return `${searchBar}${renderResults(this.filteredOptions, this.cursor)}`;
    },
  });
  return prompt.prompt();
};
