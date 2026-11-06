import { matchSorter } from "match-sorter";

/** Best matches first. Items that match equally well keep their original order. */
export const rankItems = <Item extends { name: string }>(
  query: string,
  items: readonly Item[],
): Item[] => {
  const normalizedQuery = query.trim();
  if (normalizedQuery === "") {
    return [...items];
  }
  return matchSorter([...items], normalizedQuery, {
    keys: ["name"],
    baseSort: (first, second) => first.index - second.index,
  });
};
