import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isObject } from "../../config.ts";
import { quicklinksPath } from "../../paths.ts";
import { withAction, writeLog } from "../../log.ts";
import { withStorageLock, writeAtomic } from "../../storage.ts";

export const QUICKLINKS_APP_ID = "redhot-quicklinks";
const FALLBACK_ID = "link";
const NOT_SLUG_CHARACTERS = /[^a-z0-9]+/g;
const EDGE_DASHES = /^-|-$/g;

export interface QuicklinkDraft {
  name: string;
  link: string;
  openWith?: string;
}

export interface Quicklink extends QuicklinkDraft {
  id: string;
}

/** The value saved aliases and hotkeys use for this link. */
export const toQuicklinkValue = (id: string): string => `${QUICKLINKS_APP_ID}:${id}`;

const isQuicklink = (value: unknown): value is Quicklink => {
  if (!isObject(value)) {
    return false;
  }
  const { id, name, link, openWith } = value;
  const hasValidOpenWith = openWith === undefined || typeof openWith === "string";
  return (
    typeof id === "string" &&
    typeof name === "string" &&
    typeof link === "string" &&
    hasValidOpenWith
  );
};

/** Throws on a broken file, so a save can't replace links that are only unreadable. */
export const parseQuicklinks = (fileText: string): Quicklink[] => {
  const parsed: unknown = JSON.parse(fileText);
  if (!Array.isArray(parsed)) {
    throw new TypeError("Expected a list of quicklinks");
  }
  return parsed.filter(isQuicklink);
};

/** Synchronous so search can pick up new links on each keystroke. A broken file reads as empty. */
export const readQuicklinksSync = (): Quicklink[] => {
  try {
    return parseQuicklinks(readFileSync(quicklinksPath, "utf8"));
  } catch (error) {
    if (!isMissingFileError(error)) {
      writeLog("quicklinks.read-failed", { error }, { level: "warn" });
    }
    return [];
  }
};

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const readForSaving = async (): Promise<Quicklink[]> => {
  try {
    return parseQuicklinks(await readFile(quicklinksPath, "utf8"));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw new Error(`Fix ${quicklinksPath} first, it can't be read`, {
      cause: error,
    });
  }
};

const writeQuicklinks = async (links: readonly Quicklink[]): Promise<void> => {
  await writeAtomic(quicklinksPath, `${JSON.stringify(links, null, 2)}\n`);
};

/** "GitHub Search" becomes "github-search". It never changes, so a rename keeps aliases working. */
export const toQuicklinkId = (name: string, takenIds: readonly string[]): string => {
  const slug = name.toLowerCase().replaceAll(NOT_SLUG_CHARACTERS, "-").replaceAll(EDGE_DASHES, "");
  const baseId = slug === "" ? FALLBACK_ID : slug;
  let id = baseId;
  let suffix = 2;
  while (takenIds.includes(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return id;
};

/** Returns what is wrong with this name, or undefined when it can be saved. */
export const findNameProblem = (
  input: string,
  ownId: string | undefined,
  links: readonly Quicklink[],
): string | undefined => {
  const name = input.trim().toLowerCase();
  if (name === "") {
    return "Enter a name";
  }
  const isTaken = links.some((link) => link.id !== ownId && link.name.toLowerCase() === name);
  return isTaken ? "You already have a quicklink with that name" : undefined;
};

/** Resolves to the new link's ID, which is only known once the saved links have been read. */
export const addQuicklink = (
  draft: QuicklinkDraft,
  reservedIds: readonly string[],
): Promise<string> =>
  withAction("quicklinks.add", {}, () =>
    withStorageLock(async () => {
      const links = await readForSaving();
      const id = toQuicklinkId(draft.name, [...reservedIds, ...links.map((link) => link.id)]);
      await writeQuicklinks([...links, { id, ...draft }]);
      return id;
    }),
  );

export const updateQuicklink = async (id: string, draft: QuicklinkDraft): Promise<void> => {
  await withAction("quicklinks.update", { item: `redhot-quicklinks:${id}` }, async () => {
    await withStorageLock(async () => {
      const links = await readForSaving();
      await writeQuicklinks(links.map((link) => (link.id === id ? { id, ...draft } : link)));
    });
  });
};

export const removeQuicklink = async (id: string): Promise<void> => {
  await withAction("quicklinks.remove", { item: `redhot-quicklinks:${id}` }, async () => {
    await withStorageLock(async () => {
      const links = await readForSaving();
      await writeQuicklinks(links.filter((link) => link.id !== id));
    });
  });
};
