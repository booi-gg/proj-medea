const WHITESPACE = /\s+/g;
const TRAILING_QUESTION = /[\s?]+$/;
// Dictionary entries don't run longer, and it leaves real questions like "what is the tallest
// mountain in asia" to web search.
const MAX_TERM_WORDS = 4;

/**
 * The term after one of these phrases, or undefined when the text doesn't start with one. The
 * longest phrase wins, so "what is the meaning of x" isn't read as "what is" and a long term.
 */
export const toDefineTerm = (query: string, phrases: readonly string[]): string | undefined => {
  const text = query.trim().replaceAll(WHITESPACE, " ").replace(TRAILING_QUESTION, "");
  const lowered = text.toLowerCase();
  const phrase = phrases
    .toSorted((first, second) => second.length - first.length)
    .find((candidate) => lowered.startsWith(`${candidate} `));
  if (phrase === undefined) {
    return undefined;
  }
  const term = text.slice(phrase.length + 1);
  return term.split(" ").length > MAX_TERM_WORDS ? undefined : term;
};

/** The phrases in comma-separated text, in the form they're matched in, without repeats. */
export const parsePhrases = (input: string): string[] => [
  ...new Set(
    input
      .split(",")
      .map((phrase) => phrase.trim().replaceAll(WHITESPACE, " ").toLowerCase())
      .filter((phrase) => phrase !== ""),
  ),
];
