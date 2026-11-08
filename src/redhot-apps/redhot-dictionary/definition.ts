import wrapAnsi from "wrap-ansi";

// macOS gives a definition as one long paragraph, so its parts are found from how they're marked.
const SECTION_START = /\s+(?=(?:PHRASES|PHRASAL VERBS|DERIVATIVES|ORIGIN|USAGE)\s)/g;
const SUB_SENSE = /\s+•\s+/g;
const SENSE_START =
  /\s+(?:(noun|verb|adjective|adverb|pronoun|preposition|conjunction|exclamation|determiner)\s+)?(\d{1,2})\s+(?=[^\s|])/g;
const SUB_SENSE_INDENT = "   ";
const HANGING_PREFIX = /^(?:\s*•\s|\d{1,2}\s)/;
const MIN_WRAP_WIDTH = 20;

// Only the next number in the count starts a sense, so "weighs 3 tons" stays where it is. A part
// of speech followed by 1 starts the count again.
const breakAtSenses = (text: string): string => {
  let nextSense = 1;
  return text.replaceAll(SENSE_START, (match, partOfSpeech: string | undefined, sense: string) => {
    const number = Number(sense);
    const isNewPartOfSpeech = partOfSpeech !== undefined && number === 1;
    if (!isNewPartOfSpeech && number !== nextSense) {
      return match;
    }
    nextSense = number + 1;
    const gap = isNewPartOfSpeech ? "\n\n" : "\n";
    return `${gap}${partOfSpeech === undefined ? "" : `${partOfSpeech} `}${sense} `;
  });
};

// A phrase in a section has its own numbers, which aren't part of the entry's count.
const breakAtSensesBeforeSections = (text: string): string => {
  const sectionsStart = text.search(SECTION_START);
  return sectionsStart === -1
    ? breakAtSenses(text)
    : `${breakAtSenses(text.slice(0, sectionsStart))}${text.slice(sectionsStart)}`;
};

/** Puts each sense, sub-sense and section of a definition on its own line. */
export const toDefinitionLines = (definition: string): string[] =>
  breakAtSensesBeforeSections(definition.trim())
    .replaceAll(SECTION_START, "\n\n")
    .replaceAll(SUB_SENSE, `\n${SUB_SENSE_INDENT}• `)
    .split("\n");

// Wrapped lines start under the text and not under the number or bullet.
const wrapWithHangingIndent = (line: string, width: number): string[] => {
  const prefix = HANGING_PREFIX.exec(line)?.[0] ?? "";
  const indent = " ".repeat(prefix.length);
  const bodyWidth = Math.max(width - prefix.length, MIN_WRAP_WIDTH);
  const [first = "", ...rest] = wrapAnsi(line.slice(prefix.length), bodyWidth, {
    hard: true,
  }).split("\n");
  return [`${prefix}${first}`, ...rest.map((part) => `${indent}${part}`)];
};

/** A definition laid out to read in a window this many columns wide. */
export const toDefinitionText = (definition: string, width: number): string =>
  toDefinitionLines(definition)
    .flatMap((line) => wrapWithHangingIndent(line, width))
    .join("\n");
