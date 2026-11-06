const WORD_SEPARATORS = /[\s\-_.]+/;
const NO_MATCH = -1;
const MatchRank = {
  exact: 0,
  prefix: 1,
  wordStart: 2,
  substring: 3,
  letters: 4,
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
  if (label.split(WORD_SEPARATORS).some((word) => word.startsWith(query))) {
    return MatchRank.wordStart;
  }
  if (label.includes(query)) {
    return MatchRank.substring;
  }
  return hasLettersInOrder(query, label) ? MatchRank.letters : NO_MATCH;
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
