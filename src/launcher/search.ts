import { matchSorter, rankings } from "match-sorter";

/** Best matches first. Items that match equally well keep their original order. */
export const rankItems = <Item extends { name: string; aliases?: readonly string[] }>(
  query: string,
  items: readonly Item[],
): Item[] => {
  const normalizedQuery = query.trim();
  if (normalizedQuery === "") {
    return [...items];
  }
  return matchSorter([...items], normalizedQuery, {
    keys: ["name", "aliases"],
    baseSort: (first, second) => first.index - second.index,
  });
};

/** For long text, where loose letter matching would match nearly everything. Keeps the order. */
export const rankByText = <Item extends { name: string }>(
  query: string,
  items: readonly Item[],
): Item[] =>
  matchSorter([...items], query.trim(), {
    keys: ["name"],
    threshold: rankings.CONTAINS,
    sorter: (ranked) => ranked.toSorted((first, second) => first.index - second.index),
  });
