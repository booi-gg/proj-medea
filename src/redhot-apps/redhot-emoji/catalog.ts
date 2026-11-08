import { matchSorter, rankings } from "match-sorter";

const FIELD_SEPARATOR = "|";

export interface EmojiEntry {
  character: string;
  name: string;
  keywords: readonly string[];
}

/** Reads the lines in data.ts, each one "character|name|keyword|keyword". */
export const parseEmojiData = (data: string): EmojiEntry[] =>
  data.split("\n").flatMap((line) => {
    const [character, name, ...keywords] = line.split(FIELD_SEPARATOR);
    return character === undefined || name === undefined ? [] : [{ character, name, keywords }];
  });

/** Recent picks in the order they were picked, then everything else in its usual order. */
export const withRecentsFirst = (
  entries: readonly EmojiEntry[],
  recents: readonly string[],
): EmojiEntry[] => {
  const byCharacter = new Map(entries.map((entry) => [entry.character, entry]));
  const recentCharacters = new Set(recents);
  return [
    ...recents.flatMap((character) => byCharacter.get(character) ?? []),
    ...entries.filter(({ character }) => !recentCharacters.has(character)),
  ];
};

/**
 * Best matches first, and the list's own order between equal ones, so a recent pick wins a tie. The
 * launcher's looser matching would find "fire" spelled out across the letters of unrelated names.
 */
export const rankEmoji = <Option extends { name: string; aliases: readonly string[] }>(
  query: string,
  options: readonly Option[],
): Option[] =>
  matchSorter([...options], query.trim(), {
    keys: ["name", "aliases"],
    threshold: rankings.CONTAINS,
    baseSort: (first, second) => first.index - second.index,
  });
