import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FileResult } from "../redhot-files/search.ts";

// Recents is a saved search rather than a folder, so Spotlight can never find it by name.
const RECENTS_PATH =
  "/System/Library/CoreServices/Finder.app/Contents/Resources/MyLibraries/myDocuments.cannedSearch";
const ICLOUD_DRIVE_FOLDER = "Library/Mobile Documents/com~apple~CloudDocs";
const PLACE_LOCATION = "Finder";

/** False for a Finder view like Recents, which has no folder to reveal, copy or open elsewhere. */
export const hasRealPath = (path: string): boolean => path !== RECENTS_PATH;

/** Finder's usual places, most asked-for first, leaving out any this Mac doesn't have. */
export const toPlaces = (
  home: string = homedir(),
  exists: (path: string) => boolean = existsSync,
): FileResult[] => {
  const places = [
    { name: "Recents", path: RECENTS_PATH },
    { name: "Downloads", path: join(home, "Downloads") },
    { name: "Documents", path: join(home, "Documents") },
    { name: "Desktop", path: join(home, "Desktop") },
    { name: "Home", path: home },
    { name: "iCloud Drive", path: join(home, ICLOUD_DRIVE_FOLDER) },
    { name: "Applications", path: "/Applications" },
    { name: "Pictures", path: join(home, "Pictures") },
    { name: "Movies", path: join(home, "Movies") },
    { name: "Music", path: join(home, "Music") },
  ];
  return places
    .filter(({ path }) => exists(path))
    .map((place) => ({ ...place, lastUsed: 0, location: PLACE_LOCATION }));
};
