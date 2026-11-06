const WORD_SEPARATORS = /[\s\-_.]+/;
const NO_MATCH = -1;
const MatchRank = {
  exact: 0,
  prefix: 1,
  wordStart: 2,
  initials: 3,
  substring: 4,
  lettersFromStart: 5,
  letters: 6,
} as const;

const hasLettersInOrder = (query: string, label: string): boolean => {
  let position = 0;
  for (const letter of query) {
    position = label.indexOf(letter, position);
    if (position === NO_MATCH) {
      return false;
    }
    position += 1;
  }
  return true;
};

const getMatchRank = (query: string, label: string): number => {
  if (label === query) {
    return MatchRank.exact;
  }
  if (label.startsWith(query)) {
    return MatchRank.prefix;
  }
  const words = label.split(WORD_SEPARATORS);
  if (words.some((word) => word.startsWith(query))) {
    return MatchRank.wordStart;
  }
  const initials = words.map((word) => word.charAt(0)).join("");
  if (initials.startsWith(query)) {
    return MatchRank.initials;
  }
  if (label.includes(query)) {
    return MatchRank.substring;
  }
  if (!hasLettersInOrder(query, label)) {
    return NO_MATCH;
  }
  return label.startsWith(query.charAt(0)) ? MatchRank.lettersFromStart : MatchRank.letters;
};

/** Best matches first. Items with the same rank keep their original order. */
export const rankItems = <Item extends { name: string }>(
  query: string,
  items: readonly Item[],
): Item[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === "") {
    return [...items];
  }
  return items
    .map((item) => ({ item, rank: getMatchRank(normalizedQuery, item.name.toLowerCase()) }))
    .filter(({ rank }) => rank !== NO_MATCH)
    .toSorted((first, second) => first.rank - second.rank)
    .map(({ item }) => item);
};
