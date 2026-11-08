import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import { basename, dirname, sep } from "node:path";
import { trackSpawn } from "../../log.ts";
import { UTF8_ENVIRONMENT } from "../../shell.ts";

const LAST_USED_ATTRIBUTE = "kMDItemLastUsedDate";
const ATTRIBUTE_SEPARATOR = `   ${LAST_USED_ATTRIBUTE} = `;
const ENTRY_SEPARATOR = "\0";
const WHITESPACE = /\s+/u;
const QUERY_SPECIAL_CHARACTERS = /[\\"*?]/gu;
const COMBINING_MARKS = /\p{M}/gu;
// Everything people keep files in. The rest of the disk is macOS's own, which search would drown in.
const SEARCHED_ROOTS = ["/Applications/", "/Volumes/"];
const SKIPPED_FOLDERS = new Set(["node_modules", "Library"]);
// iCloud Drive lives inside Library, and it's where a lot of people keep everything.
const ICLOUD_FOLDER = "Library/Mobile Documents/";
// Files inside these are an app's own parts, even though Spotlight indexes them.
const BUNDLE_FOLDER = /\.(?:app|bundle|framework|photoslibrary)$/u;
const SEARCH_DELAY_MS = 100;
// Spotlight can match tens of thousands of files, and reading them all takes seconds. These stop
// it early: enough to find good matches, and few enough that a common word stays quick.
const MAX_KEPT_FILES = 300;
const MAX_SCANNED_FILES = 5000;
const MAX_RESULTS = 50;

export interface FileResult {
  path: string;
  name: string;
  /** When the file was last opened, in milliseconds, or 0 when Spotlight doesn't know. */
  lastUsed: number;
  /** Shown beside the name in place of its folder. */
  location?: string;
}

/** Sends entries as Spotlight finds them, and resolves when it has stopped. */
export type FindFiles = (
  spotlightQuery: string,
  onEntries: (entries: readonly string[]) => void,
  signal: AbortSignal,
) => Promise<void>;

const toTerms = (query: string): string[] =>
  query
    .trim()
    .split(WHITESPACE)
    .filter((term) => term !== "");

/**
 * A raw query rather than `mdfind -name`, which reads text starting with a dash as an option and
 * refuses to run. Every word has to be in the name, in any order.
 */
export const toSpotlightQuery = (query: string): string | undefined => {
  const terms = toTerms(query);
  if (terms.length === 0) {
    return undefined;
  }
  return terms
    .map((term) => `kMDItemFSName == "*${term.replaceAll(QUERY_SPECIAL_CHARACTERS, "\\$&")}*"cd`)
    .join(" && ");
};

/** Reads one `<path>   kMDItemLastUsedDate = <date>` entry from Spotlight. */
export const parseEntry = (entry: string): FileResult | undefined => {
  const separatorAt = entry.lastIndexOf(ATTRIBUTE_SEPARATOR);
  if (separatorAt === -1) {
    return undefined;
  }
  const path = entry.slice(0, separatorAt);
  const lastUsed = Date.parse(entry.slice(separatorAt + ATTRIBUTE_SEPARATOR.length));
  return { path, name: basename(path), lastUsed: Number.isNaN(lastUsed) ? 0 : lastUsed };
};

/** A folder whose contents search leaves out: hidden, dependencies, Library, or an app's parts. */
export const isSkippedFolder = (folder: string): boolean =>
  (folder.startsWith(".") && folder !== ".") ||
  SKIPPED_FOLDERS.has(folder) ||
  BUNDLE_FOLDER.test(folder);

/** Whether a path is somewhere people keep files. Only its folders count, so `.env` can be found. */
export const isSearchablePath = (path: string, home: string = homedir()): boolean => {
  const homePrefix = `${home}${sep}`;
  const isUnderHome = path.startsWith(homePrefix);
  if (!isUnderHome && !SEARCHED_ROOTS.some((root) => path.startsWith(root))) {
    return false;
  }
  const inHome = isUnderHome ? path.slice(homePrefix.length) : path;
  const inICloud = inHome.startsWith(ICLOUD_FOLDER);
  const relative = inICloud ? inHome.slice(ICLOUD_FOLDER.length) : inHome;
  return !dirname(relative).split(sep).some(isSkippedFolder);
};

// Spotlight ignores case and accents, and macOS often stores é as e plus a separate accent.
const toComparable = (text: string): string =>
  text.normalize("NFD").replaceAll(COMBINING_MARKS, "").toLowerCase();

const withoutExtension = (name: string): string => {
  const dotAt = name.lastIndexOf(".");
  return dotAt > 0 ? name.slice(0, dotAt) : name;
};

/** The exact name first, then whatever was opened most recently, then names that start the same. */
export const rankFiles = (files: readonly FileResult[], query: string): FileResult[] => {
  const target = toComparable(query.trim());
  const isExact = ({ name }: FileResult): boolean => {
    const comparable = toComparable(name);
    return comparable === target || toComparable(withoutExtension(name)) === target;
  };
  const startsSame = ({ name }: FileResult): boolean => toComparable(name).startsWith(target);
  return files.toSorted(
    (first, second) =>
      Number(isExact(second)) - Number(isExact(first)) ||
      second.lastUsed - first.lastUsed ||
      Number(startsSame(second)) - Number(startsSame(first)) ||
      first.path.length - second.path.length,
  );
};

const findWithSpotlight: FindFiles = async (spotlightQuery, onEntries, signal) => {
  const child = trackSpawn(
    spawn("mdfind", ["-0", "-attr", LAST_USED_ATTRIBUTE, spotlightQuery], {
      env: UTF8_ENVIRONMENT,
      // mdfind writes its own start-up chatter to stderr.
      stdio: ["ignore", "pipe", "ignore"],
    }),
    "mdfind",
  );
  const stop = (): void => {
    child.kill();
  };
  signal.addEventListener("abort", stop, { once: true });
  let unfinished = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    const entries = `${unfinished}${chunk}`.split(ENTRY_SEPARATOR);
    unfinished = entries.pop() ?? "";
    onEntries(entries);
  });
  // A failure to start is logged by trackSpawn, and shows here as no results.
  await once(child, "close").catch(() => []);
  signal.removeEventListener("abort", stop);
};

export interface FileSearch {
  /** Starts a new search shortly, and stops the one before it. */
  setQuery: (query: string) => void;
  getResults: () => readonly FileResult[];
  isSearching: () => boolean;
  /** Set while a list is showing, because results land after the keystroke that asked for them. */
  setOnChange: (listener: (() => void) | undefined) => void;
  stop: () => void;
}

interface FileSearchOptions {
  find?: FindFiles;
  delayMs?: number;
  home?: string;
  /** Turns the typed text into a Spotlight query, or undefined when there's nothing to search. */
  toQuery?: (query: string) => string | undefined;
  isSearchable?: (path: string, home: string) => boolean;
  /** Listed above Spotlight's results when their names match, and all of them before any typing. */
  pinned?: readonly FileResult[];
}

export const createFileSearch = ({
  find = findWithSpotlight,
  delayMs = SEARCH_DELAY_MS,
  home = homedir(),
  toQuery = toSpotlightQuery,
  isSearchable = isSearchablePath,
  pinned = [],
}: FileSearchOptions = {}): FileSearch => {
  let currentQuery = "";
  let results: FileResult[] = [];
  let resultsQuery = "";
  let searching = false;
  let timer: NodeJS.Timeout | undefined;
  let running: AbortController | undefined;
  let onChange: (() => void) | undefined;

  const stop = (): void => {
    clearTimeout(timer);
    running?.abort();
    running = undefined;
    searching = false;
  };

  const run = async (query: string, spotlightQuery: string): Promise<void> => {
    const controller = new AbortController();
    running = controller;
    const kept: FileResult[] = [];
    let scanned = 0;
    let hasShownFirst = false;
    const publish = (): void => {
      results = rankFiles(kept, query).slice(0, MAX_RESULTS);
      resultsQuery = query;
      onChange?.();
    };
    const onEntries = (entries: readonly string[]): void => {
      if (running !== controller) {
        return;
      }
      for (const entry of entries) {
        scanned += 1;
        const file = parseEntry(entry);
        if (file !== undefined && isSearchable(file.path, home)) {
          kept.push(file);
        }
      }
      if (kept.length >= MAX_KEPT_FILES || scanned >= MAX_SCANNED_FILES) {
        controller.abort();
      }
      // Only the first batch and the finished list, so rows don't jump around while reading.
      if (!hasShownFirst && kept.length > 0) {
        hasShownFirst = true;
        publish();
      }
    };
    await find(spotlightQuery, onEntries, controller.signal);
    if (running !== controller) {
      return;
    }
    running = undefined;
    searching = false;
    publish();
  };

  const setQuery = (query: string): void => {
    const next = query.trim();
    if (next === currentQuery) {
      return;
    }
    currentQuery = next;
    stop();
    const spotlightQuery = toQuery(next);
    if (spotlightQuery === undefined) {
      results = [];
      resultsQuery = "";
      return;
    }
    searching = true;
    timer = setTimeout(() => {
      void run(next, spotlightQuery);
    }, delayMs);
  };

  // The last results stay up while the next ones load, narrowed so nothing listed contradicts
  // what's been typed.
  const getResults = (): readonly FileResult[] => {
    const terms = toTerms(toComparable(currentQuery));
    const matchesText = ({ name }: FileResult): boolean => {
      const comparable = toComparable(name);
      return terms.every((term) => comparable.includes(term));
    };
    const found = resultsQuery === currentQuery ? results : results.filter(matchesText);
    const pinnedMatches = pinned.filter(matchesText);
    const pinnedPaths = new Set(pinnedMatches.map(({ path }) => path));
    return [...pinnedMatches, ...found.filter(({ path }) => !pinnedPaths.has(path))];
  };

  const setOnChange = (listener: (() => void) | undefined): void => {
    onChange = listener;
  };

  return { setQuery, getResults, isSearching: () => searching, setOnChange, stop };
};
