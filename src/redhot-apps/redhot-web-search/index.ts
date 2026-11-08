import { DEFAULT_WEB_SEARCH_ENGINE, readConfigSync } from "../../config.ts";
import type { AliasMap, WebSearchEngine } from "../../config.ts";
import { fitToColumns } from "../../launcher/screen.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { toRedhotIcon } from "../icon.ts";
import { openTarget, readClipboard } from "../redhot-quicklinks/open-link.ts";
import { fillLink, usesClipboard } from "../redhot-quicklinks/placeholders.ts";
import { readQuicklinksSync } from "../redhot-quicklinks/store.ts";
import type { Quicklink } from "../redhot-quicklinks/store.ts";
import type { LauncherItem } from "../types.ts";
import { findAliasSearch } from "./alias-search.ts";
import type { AliasSearch } from "./alias-search.ts";
import { WEB_SEARCH_ENGINES } from "./engines.ts";

const APP_ID = "redhot-web-search";
export const WEB_SEARCH_FALLBACK_VALUE = `${APP_ID}:fallback`;
const ALIAS_SEARCH_VALUE = `${APP_ID}:quicklink`;
const ICON = toRedhotIcon("↗");
const ENGINE_ARGUMENT_KEY = "query";
// Leaves room for the kind on the same row, because a row that wraps breaks the redraw.
const MAX_NAME_COLUMNS = 60;

const toShownName = (name: string): string => fitToColumns(toSafeName(name), MAX_NAME_COLUMNS);

export const toWebSearchLink = (engine: WebSearchEngine, query: string): string =>
  fillLink(WEB_SEARCH_ENGINES[engine].link, {
    answers: new Map([[ENGINE_ARGUMENT_KEY, query.trim()]]),
    clipboard: "",
  });

/** The row search offers when nothing matches. */
export const toWebSearchItem = (
  query: string,
  engine: WebSearchEngine = readConfigSync().webSearchEngine ?? DEFAULT_WEB_SEARCH_ENGINE,
): LauncherItem | undefined => {
  const text = query.trim();
  if (text === "") {
    return undefined;
  }
  return {
    value: WEB_SEARCH_FALLBACK_VALUE,
    name: toShownName(`Search ${WEB_SEARCH_ENGINES[engine].name} for '${text}'`),
    icon: ICON,
    kind: "Web Search",
    footer: "↵ search the web",
    run: async () => {
      await openTarget(toWebSearchLink(engine, text));
      return "";
    },
  };
};

const openAliasSearch = async ({ quicklink, argumentKey, text }: AliasSearch): Promise<string> => {
  const { link, openWith } = quicklink;
  const clipboard = usesClipboard(link) ? await readClipboard() : "";
  await openTarget(
    fillLink(link, { answers: new Map([[argumentKey, text]]), clipboard }),
    openWith,
  );
  return "";
};

/** The row for an alias followed by text, like "yt lofi". */
export const toAliasSearchItem = (
  query: string,
  links: readonly Quicklink[] = readQuicklinksSync(),
  aliases: AliasMap = readConfigSync().aliases,
): LauncherItem | undefined => {
  const search = findAliasSearch(query, links, aliases);
  if (search === undefined) {
    return undefined;
  }
  return {
    value: ALIAS_SEARCH_VALUE,
    name: toShownName(`${search.quicklink.name}: ${search.text}`),
    icon: ICON,
    kind: "Quicklink",
    footer: "↵ open",
    run: () => openAliasSearch(search),
  };
};
