import type { AliasMap } from "../../config.ts";
import { findArguments } from "../redhot-quicklinks/placeholders.ts";
import { toQuicklinkValue } from "../redhot-quicklinks/store.ts";
import type { Quicklink } from "../redhot-quicklinks/store.ts";

// "gh redhot cli" is the alias "gh" and the text "redhot cli".
const ALIAS_AND_TEXT = /^(\S+)\s+(.+)$/su;

export interface AliasSearch {
  quicklink: Quicklink;
  argumentKey: string;
  text: string;
}

/**
 * Finds the quicklink an alias and some text would fill. A link with more than one question isn't
 * offered, because the text couldn't answer them all. It still opens and asks as usual.
 */
export const findAliasSearch = (
  query: string,
  links: readonly Quicklink[],
  aliases: AliasMap,
): AliasSearch | undefined => {
  const [, alias = "", text = ""] = ALIAS_AND_TEXT.exec(query.trim()) ?? [];
  if (alias === "") {
    return undefined;
  }
  const typedAlias = alias.toLowerCase();
  for (const quicklink of links) {
    const [onlyArgument, ...otherArguments] = findArguments(quicklink.link);
    const isOffered =
      onlyArgument !== undefined &&
      otherArguments.length === 0 &&
      aliases[toQuicklinkValue(quicklink.id)]?.includes(typedAlias) === true;
    if (isOffered) {
      return { quicklink, argumentKey: onlyArgument.key, text };
    }
  }
  return undefined;
};
