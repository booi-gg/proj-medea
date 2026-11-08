import { askForWindowAccess, sendHelperRequest } from "../../menubar/helper-socket.ts";

// Longer than other requests, because a big menu takes the helper up to two and a half seconds.
const REQUEST_TIMEOUT_MS = 5000;
const LIST_REQUEST = "menu-items list";
const PRESS_REQUEST = "menu-items press";
const OK_REPLY = "ok";
const NO_ACCESS_REPLY = "no-access";
const NO_APP_REPLY = "no-app";
const OLD_HELPER_REPLY = "bad-command";
const PATH_KEY_SEPARATOR = "\0";
const NO_HELPER_MESSAGE =
  "Searching menus needs the menu bar item. Use Add Menu Bar Item, or restart it if it's on";
const NO_ACCESS_MESSAGE = "Turn on redhot-status under Accessibility, then try again";
const NO_APP_MESSAGE = "There's no other app to search yet. Switch to one, then come back";
const UNREADABLE_MESSAGE = "The menu couldn't be read";

export interface MenuItem {
  /** From the menu bar down, like ["File", "Export", "PDF"]. */
  path: readonly string[];
  isEnabled: boolean;
  /** The shortcut as macOS reports it. format.ts writes it out. */
  key: string;
  glyph: number;
  modifiers: number;
}

export interface AppMenu {
  app: string;
  pid: number;
  /** True when the app was too big or too slow to read all of it. */
  isPartial: boolean;
  items: readonly MenuItem[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((part) => typeof part === "string");

const isMenuItem = (value: unknown): value is MenuItem =>
  isRecord(value) &&
  isStringArray(value.path) &&
  typeof value.isEnabled === "boolean" &&
  typeof value.key === "string" &&
  typeof value.glyph === "number" &&
  typeof value.modifiers === "number";

/**
 * One row per path, because a row is pressed by its path. macOS repeats names in the Window menu's
 * section headings, and apps keep hidden copies of items, so an enabled one is the one that counts.
 */
const toUniquePaths = (items: readonly MenuItem[]): MenuItem[] => {
  const byPath = new Map<string, MenuItem>();
  for (const item of items) {
    const key = item.path.join(PATH_KEY_SEPARATOR);
    const kept = byPath.get(key);
    if (kept === undefined || (item.isEnabled && !kept.isEnabled)) {
      byPath.set(key, item);
    }
  }
  return [...byPath.values()];
};

/** Returns undefined for anything other than the helper's list. */
export const parseAppMenu = (reply: string): AppMenu | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.app !== "string" ||
    typeof parsed.pid !== "number" ||
    typeof parsed.isPartial !== "boolean" ||
    !Array.isArray(parsed.items) ||
    !parsed.items.every(isMenuItem)
  ) {
    return undefined;
  }
  const { app, pid, isPartial, items } = parsed;
  return { app, pid, isPartial, items: toUniquePaths(items) };
};

/** Base64, because a title can hold spaces and the helper reads one line of words. */
export const toPressRequest = (pid: number, path: readonly string[]): string =>
  `${PRESS_REQUEST} ${pid} ${Buffer.from(JSON.stringify(path)).toString("base64")}`;

const ask = async (request: string): Promise<string> => {
  const reply = await sendHelperRequest(request, REQUEST_TIMEOUT_MS);
  // An older helper doesn't know these requests, so it counts the same as none running.
  if (reply === undefined || reply === OLD_HELPER_REPLY) {
    throw new Error(NO_HELPER_MESSAGE);
  }
  if (reply === NO_ACCESS_REPLY) {
    await askForWindowAccess();
    throw new Error(NO_ACCESS_MESSAGE);
  }
  return reply;
};

/** The menus of the last app used before Redhot's window came to the front. */
export const readPreviousAppMenu = async (): Promise<AppMenu> => {
  const reply = await ask(LIST_REQUEST);
  if (reply === NO_APP_REPLY) {
    throw new Error(NO_APP_MESSAGE);
  }
  const menu = parseAppMenu(reply);
  if (menu === undefined) {
    throw new Error(UNREADABLE_MESSAGE);
  }
  return menu;
};

// The keys are the helper's replies, from native/MenuSearch.swift.
const toPressFailure = (reply: string, app: string): string => {
  const messages: Record<string, string> = {
    [NO_APP_REPLY]: `${app} isn't open any more`,
    "not-frontmost": `${app} didn't come to the front`,
    missing: `That item isn't in ${app}'s menus any more`,
    disabled: `That item is turned off in ${app} right now`,
  };
  return messages[reply] ?? `${app} didn't run that item`;
};

/** Brings the app to the front and presses the item. Throws a sentence when it can't. */
export const pressMenuItem = async ({ app, pid }: AppMenu, item: MenuItem): Promise<void> => {
  const reply = await ask(toPressRequest(pid, item.path));
  if (reply !== OK_REPLY) {
    throw new Error(toPressFailure(reply, app));
  }
};
