import { DEFAULT_DEFINE_PHRASES, readConfigSync } from "../../config.ts";
import { showInPager } from "../../launcher/pager.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { buildDictionaryLookup } from "../../menubar/helper.ts";
import { dictionaryLookupPath } from "../../paths.ts";
import { runCommand } from "../../shell.ts";
import { toPreview, toSafeText } from "../redhot-clipboard-history/format.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem } from "../types.ts";
import { toDefinitionText } from "./definition.ts";
import { toDefineTerm } from "./phrases.ts";

export const DEFINE_VALUE = "redhot-dictionary:define";
const ICON = toRedhotIcon("¶");
const LEADING_ARTICLE = /^(?:a|an|the) (?=\S)/i;
const FALLBACK_COLUMNS = 80;
// Less cuts off a line that fills the window, so wrapping stops short of the edge.
const PAGER_MARGIN = 2;
const MAX_ROW_TERM_WIDTH = 25;
const MAX_NOTICE_TERM_WIDTH = 60;

const lookUp = async (term: string): Promise<string> => {
  const { stdout } = await runCommand(dictionaryLookupPath, [term]);
  return stdout.trim();
};

// "what is a noun" asks about "noun", but "a priori" is an entry, so the words as typed go first.
const findDefinition = async (term: string): Promise<string> => {
  const definition = await lookUp(term);
  const bareTerm = term.replace(LEADING_ARTICLE, "");
  return definition === "" && bareTerm !== term ? lookUp(bareTerm) : definition;
};

const showDefinition = async (term: string): Promise<string> => {
  const termLabel = toPreview(term, MAX_NOTICE_TERM_WIDTH);
  drawScreen({ title: "Dictionary", icon: ICON, notice: `Looking up ${termLabel}` });
  await buildDictionaryLookup();
  const definition = await findDefinition(term);
  if (definition === "") {
    return `No definition for ${termLabel}`;
  }
  const width = (process.stdout.columns ?? FALLBACK_COLUMNS) - PAGER_MARGIN;
  await showInPager(toDefinitionText(toSafeText(definition), width), { leftArrowGoesBack: true });
  return "";
};

/**
 * The row for a phrase and a term typed into search, or undefined when the text isn't that. Rows
 * are made on every keystroke, so the lookup waits for Enter.
 */
export const toDictionaryItem = (
  query: string,
  phrases: readonly string[] = readConfigSync().definePhrases ?? DEFAULT_DEFINE_PHRASES,
): LauncherItem | undefined => {
  const term = toDefineTerm(query, phrases);
  return term === undefined
    ? undefined
    : {
        value: DEFINE_VALUE,
        name: `Define ${toPreview(term, MAX_ROW_TERM_WIDTH)}`,
        icon: ICON,
        kind: "Dictionary",
        footer: "↵ define",
        run: () => showDefinition(term),
      };
};
