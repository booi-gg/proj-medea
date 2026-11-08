import type { AliasMap, WebSearchEngine } from "../../config.ts";
import type { Quicklink } from "../redhot-quicklinks/store.ts";

interface FallbackEngine {
  name: string;
  link: string;
}

/** What search offers when nothing matches. Links use {query}, like any quicklink. */
export const WEB_SEARCH_ENGINES: Record<WebSearchEngine, FallbackEngine> = {
  google: { name: "Google", link: "https://www.google.com/search?q={query}" },
  duckduckgo: { name: "DuckDuckGo", link: "https://duckduckgo.com/?q={query}" },
  kagi: { name: "Kagi", link: "https://kagi.com/search?q={query}" },
};

export interface ReadyMadeEngine {
  name: string;
  link: string;
  alias: string;
}

export const READY_MADE_ENGINES: readonly ReadyMadeEngine[] = [
  { name: "GitHub Search", link: "https://github.com/search?q={query}", alias: "gh" },
  {
    name: "YouTube Search",
    link: "https://www.youtube.com/results?search_query={query}",
    alias: "yt",
  },
  { name: "Google Search", link: "https://www.google.com/search?q={query}", alias: "g" },
  {
    name: "Wikipedia Search",
    link: "https://en.wikipedia.org/wiki/Special:Search?search={query}",
    alias: "wiki",
  },
  { name: "npm Search", link: "https://www.npmjs.com/search?q={query}", alias: "npm" },
  {
    name: "Stack Overflow Search",
    link: "https://stackoverflow.com/search?q={query}",
    alias: "so",
  },
];

/** Leaves out any engine already saved, by name or by link, however it was added. */
export const listAddableEngines = (links: readonly Quicklink[]): ReadyMadeEngine[] =>
  READY_MADE_ENGINES.filter(
    ({ name, link }) =>
      !links.some(
        (saved) => saved.name.toLowerCase() === name.toLowerCase() || saved.link === link,
      ),
  );

export const isAliasTaken = (alias: string, aliases: AliasMap): boolean =>
  Object.values(aliases).some((list) => list.includes(alias));

export const toAddedMessage = (
  added: readonly ReadyMadeEngine[],
  withoutAlias: readonly ReadyMadeEngine[],
): string => {
  const count = added.length === 1 ? "1 search engine" : `${added.length} search engines`;
  if (withoutAlias.length > 0) {
    const names = withoutAlias.map(({ name }) => name).join(", ");
    return `Added ${count}. Usual alias taken, so set one with Tab for: ${names}`;
  }
  return `Added ${count}. Type an alias and a search, like ${added[0]?.alias} redhot`;
};
