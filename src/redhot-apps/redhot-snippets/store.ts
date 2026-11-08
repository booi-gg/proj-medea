import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isObject } from "../../config.ts";
import { withAction, writeLog } from "../../log.ts";
import { snippetsPath } from "../../paths.ts";
import { withStorageLock, writeAtomic } from "../../storage.ts";
import { toQuicklinkId } from "../redhot-quicklinks/store.ts";

export const SNIPPETS_APP_ID = "redhot-snippets";
// One character would expand on nearly every press of that key.
const MIN_KEYWORD_LENGTH = 2;
const MAX_KEYWORD_LENGTH = 32;
// Keeps a snippet well inside the size sync allows for one change, whatever characters it uses.
const MAX_TEXT_LENGTH = 16_000;
const WHITESPACE = /\s/;

export interface SnippetDraft {
  name: string;
  /** What to type in any app to expand this. Without one, it's only found through search. */
  keyword?: string;
  text: string;
}

export interface Snippet extends SnippetDraft {
  id: string;
}

/** The value saved aliases and hotkeys use for this snippet. */
export const toSnippetValue = (id: string): string => `${SNIPPETS_APP_ID}:${id}`;

const isSnippet = (value: unknown): value is Snippet => {
  if (!isObject(value)) {
    return false;
  }
  const { id, name, keyword, text } = value;
  const hasValidKeyword = keyword === undefined || typeof keyword === "string";
  return (
    typeof id === "string" &&
    typeof name === "string" &&
    typeof text === "string" &&
    hasValidKeyword
  );
};

/** Throws on a broken file, so a save can't replace snippets that are only unreadable. */
export const parseSnippets = (fileText: string): Snippet[] => {
  const parsed: unknown = JSON.parse(fileText);
  if (!Array.isArray(parsed)) {
    throw new TypeError("Expected a list of snippets");
  }
  return parsed.filter(isSnippet);
};

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** Synchronous so search can pick up new snippets on each keystroke. A broken file reads as empty. */
export const readSnippetsSync = (): Snippet[] => {
  try {
    return parseSnippets(readFileSync(snippetsPath, "utf8"));
  } catch (error) {
    if (!isMissingFileError(error)) {
      writeLog("snippets.read-failed", { error }, { level: "warn" });
    }
    return [];
  }
};

const readForSaving = async (): Promise<Snippet[]> => {
  try {
    return parseSnippets(await readFile(snippetsPath, "utf8"));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw new Error(`Fix ${snippetsPath} first, it can't be read`, { cause: error });
  }
};

const writeSnippets = async (snippets: readonly Snippet[]): Promise<void> => {
  await writeAtomic(snippetsPath, `${JSON.stringify(snippets, null, 2)}\n`);
};

/** Returns what is wrong with this text, or undefined when it can be saved. */
export const findTextProblem = (input: string): string | undefined => {
  if (input.trim() === "") {
    return "Enter some text";
  }
  return input.length > MAX_TEXT_LENGTH
    ? `Keep it under ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters`
    : undefined;
};

/** Returns what is wrong with this name, or undefined when it can be saved. */
export const findNameProblem = (
  input: string,
  ownId: string | undefined,
  snippets: readonly Snippet[],
): string | undefined => {
  const name = input.trim().toLowerCase();
  if (name === "") {
    return "Enter a name";
  }
  const isTaken = snippets.some(
    (snippet) => snippet.id !== ownId && snippet.name.toLowerCase() === name,
  );
  return isTaken ? "You already have a snippet with that name" : undefined;
};

/**
 * Returns what is wrong with this keyword, or undefined when it can be saved. Expansion happens as
 * soon as a keyword is complete, so one that starts another would make the longer one unreachable.
 */
export const findKeywordProblem = (
  input: string,
  ownId: string | undefined,
  snippets: readonly Snippet[],
): string | undefined => {
  const keyword = input.trim();
  if (keyword === "") {
    return undefined;
  }
  if (WHITESPACE.test(keyword)) {
    return "A keyword can't contain spaces";
  }
  if (keyword.length < MIN_KEYWORD_LENGTH || keyword.length > MAX_KEYWORD_LENGTH) {
    return `Use ${MIN_KEYWORD_LENGTH} to ${MAX_KEYWORD_LENGTH} characters`;
  }
  for (const { id, keyword: other } of snippets) {
    if (id !== ownId && other !== undefined) {
      if (other === keyword) {
        return "Another snippet uses that keyword";
      }
      if (other.startsWith(keyword) || keyword.startsWith(other)) {
        return `That overlaps with ${other}, and only the shorter one could ever expand`;
      }
    }
  }
  return undefined;
};

export const addSnippet = (draft: SnippetDraft, reservedIds: readonly string[]): Promise<string> =>
  withAction("snippets.add", {}, () =>
    withStorageLock(async () => {
      const snippets = await readForSaving();
      const id = toQuicklinkId(draft.name, [...reservedIds, ...snippets.map((item) => item.id)]);
      await writeSnippets([...snippets, { id, ...draft }]);
      return id;
    }),
  );

export const updateSnippet = async (id: string, draft: SnippetDraft): Promise<void> => {
  await withAction("snippets.update", { item: toSnippetValue(id) }, async () => {
    await withStorageLock(async () => {
      const snippets = await readForSaving();
      await writeSnippets(snippets.map((item) => (item.id === id ? { id, ...draft } : item)));
    });
  });
};

export const removeSnippet = async (id: string): Promise<void> => {
  await withAction("snippets.remove", { item: toSnippetValue(id) }, async () => {
    await withStorageLock(async () => {
      const snippets = await readForSaving();
      await writeSnippets(snippets.filter((item) => item.id !== id));
    });
  });
};
