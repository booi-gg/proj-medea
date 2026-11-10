import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";

export interface AppIdentity {
  bundleId: string;
  /** Names a folder could be called, already checked to belong to this app alone. */
  names: readonly string[];
}

export type MatchedBy = "bundle-id" | "name";

export interface AppDataItem {
  path: string;
  matchedBy: MatchedBy;
}

type Rule = (entry: string, app: AppIdentity) => MatchedBy | undefined;

const BUNDLE_ID = /^[\w-]+(?:\.[\w-]+)+$/u;
const APPLE_BUNDLE_PREFIX = "com.apple.";
// A two-letter folder name says too little about what's in it to be moved on a name alone.
const MIN_NAME_LENGTH = 3;
// A folder with one of these names holds other things too, even when an app shares the name.
const SHARED_FOLDER_NAMES: ReadonlySet<string> = new Set([
  "adobe",
  "amazon",
  "app",
  "apple",
  "application",
  "applications",
  "apps",
  "autodesk",
  "cache",
  "caches",
  "cloudkit",
  "crashreporter",
  "data",
  "default",
  "electron",
  "fileprovider",
  "files",
  "google",
  "helper",
  "icloud",
  "installer",
  "jetbrains",
  "launcher",
  "library",
  "local",
  "logs",
  "microsoft",
  "mobilesync",
  "mozilla",
  "oracle",
  "preferences",
  "settings",
  "setup",
  "shared",
  "support",
  "system",
  "temp",
  "tmp",
  "update",
  "updater",
  "user",
  "users",
]);
// Only these count after an app's ID. "com.google.Chrome.canary" starts with Chrome's ID and is a
// different app, so a longer ID doesn't mean it belongs to this one.
const HELPER_ID_ENDINGS: ReadonlySet<string> = new Set([
  "helper",
  "launcher",
  "login-helper",
  "loginhelper",
  "shipit",
  "updater",
]);
// "group.com.example.app", or a developer's team ID in front of the app's ID.
const TEAM_ID_PREFIX = /^[a-z0-9]{10}\.(?:group\.)?/u;
const GROUP_PREFIX = "group.";
const BY_HOST_ENDING = /\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.plist$/iu;

const toComparable = (text: string): string => text.normalize("NFC").toLowerCase();

const isSpecificName = (name: string, otherAppNames: ReadonlySet<string>): boolean => {
  const comparable = toComparable(name);
  return (
    comparable.length >= MIN_NAME_LENGTH &&
    !SHARED_FOLDER_NAMES.has(comparable) &&
    !otherAppNames.has(comparable)
  );
};

/** Undefined when the app has no usable ID, in which case none of its data can be told apart. */
export const toAppIdentity = ({
  bundleId,
  appName,
  bundleName,
  otherAppNames,
}: {
  bundleId: string | undefined;
  appName: string;
  bundleName: string | undefined;
  otherAppNames: readonly string[];
}): AppIdentity | undefined => {
  if (bundleId === undefined || !BUNDLE_ID.test(bundleId)) {
    return undefined;
  }
  // Apple's folders are named for features as much as apps, so its apps only match by ID.
  if (toComparable(bundleId).startsWith(APPLE_BUNDLE_PREFIX)) {
    return { bundleId, names: [] };
  }
  const others = new Set(otherAppNames.map(toComparable));
  const candidates = [appName, ...(bundleName === undefined ? [] : [bundleName])];
  const names = [...new Set(candidates)].filter((name) => isSpecificName(name, others));
  return { bundleId, names };
};

const byBundleId: Rule = (entry, { bundleId }) => {
  const name = toComparable(entry);
  const id = toComparable(bundleId);
  const isMatch =
    name === id || (name.startsWith(`${id}.`) && HELPER_ID_ENDINGS.has(name.slice(id.length + 1)));
  return isMatch ? "bundle-id" : undefined;
};

const byBundleIdOrName: Rule = (entry, app) => {
  const found = byBundleId(entry, app);
  if (found !== undefined) {
    return found;
  }
  const name = toComparable(entry);
  return app.names.some((candidate) => toComparable(candidate) === name) ? "name" : undefined;
};

const withEnding =
  (ending: string): Rule =>
  (entry, app) =>
    toComparable(entry).endsWith(toComparable(ending))
      ? byBundleId(entry.slice(0, -ending.length), app)
      : undefined;

const byGroupContainer: Rule = (entry, { bundleId }) => {
  const name = toComparable(entry);
  const id = toComparable(bundleId);
  const isMatch = name === `${GROUP_PREFIX}${id}` || name.replace(TEAM_ID_PREFIX, "") === id;
  return isMatch ? "bundle-id" : undefined;
};

const byHostPreference: Rule = (entry, app) =>
  BY_HOST_ENDING.test(entry) ? byBundleId(entry.replace(BY_HOST_ENDING, ""), app) : undefined;

const bySiteStorage: Rule = (entry, app) =>
  byBundleId(entry, app) ?? withEnding(".binarycookies")(entry, app);

// Only the first level of these is read. An app's data is never looked for anywhere else.
const LOCATIONS: readonly { folder: string; rule: Rule }[] = [
  { folder: "Application Support", rule: byBundleIdOrName },
  { folder: "Caches", rule: byBundleIdOrName },
  { folder: "Logs", rule: byBundleIdOrName },
  { folder: "Preferences", rule: withEnding(".plist") },
  { folder: join("Preferences", "ByHost"), rule: byHostPreference },
  { folder: "Saved Application State", rule: withEnding(".savedState") },
  { folder: "Containers", rule: byBundleId },
  { folder: "Group Containers", rule: byGroupContainer },
  { folder: "Application Scripts", rule: byBundleId },
  { folder: "HTTPStorages", rule: bySiteStorage },
  { folder: "WebKit", rule: byBundleId },
  { folder: "Cookies", rule: withEnding(".binarycookies") },
  { folder: "LaunchAgents", rule: withEnding(".plist") },
];

const overlaps = (first: string, second: string): boolean => {
  const [one, other] = [toComparable(first), toComparable(second)];
  return one === other || one.startsWith(`${other}${sep}`) || other.startsWith(`${one}${sep}`);
};

/** A folder macOS won't let us read counts as empty, since nothing in it can be listed. */
export const findAppData = async (
  app: AppIdentity,
  libraryDir: string,
  protectedPaths: readonly string[],
): Promise<AppDataItem[]> => {
  const found = await Promise.all(
    LOCATIONS.map(async ({ folder, rule }) => {
      const location = join(libraryDir, folder);
      const entries = await readdir(location).catch((): string[] => []);
      return entries.toSorted().flatMap((entry): AppDataItem[] => {
        const matchedBy = rule(entry, app);
        return matchedBy === undefined ? [] : [{ path: join(location, entry), matchedBy }];
      });
    }),
  );
  return found.flat().filter(({ path }) => !protectedPaths.some((own) => overlaps(path, own)));
};
