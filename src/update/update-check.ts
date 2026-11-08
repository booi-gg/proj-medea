import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../config.ts";
import { withAction } from "../log.ts";
import { buildDir, isInstalled } from "../paths.ts";
import { writeAtomic } from "../storage.ts";
import { readPackageInfo } from "../version.ts";

const REGISTRY_URL = "https://registry.npmjs.org";
const CHECK_TIMEOUT_MS = 5000;
// Automatic checks reach npm at most once a day. The menu's Check for Updates always does.
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const savedCheckPath = join(buildDir, "update-check.json");

export interface UpdateStatus {
  current: string;
  latest?: string;
  updateAvailable: boolean;
}

interface SavedCheck {
  checkedAt: number;
  latest: string;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/u;

const compareNumbers = (left: number, right: number): number => Math.sign(left - right);

/** Positive when left is newer, negative when right is, 0 when equal or either can't be read. */
export const compareVersions = (left: string, right: string): number => {
  const leftMatch = VERSION_PATTERN.exec(left.trim());
  const rightMatch = VERSION_PATTERN.exec(right.trim());
  if (leftMatch === null || rightMatch === null) {
    return 0;
  }
  for (const index of [1, 2, 3]) {
    const order = compareNumbers(Number(leftMatch[index]), Number(rightMatch[index]));
    if (order !== 0) {
      return order;
    }
  }
  const [leftPre, rightPre] = [leftMatch[4], rightMatch[4]];
  // A release is newer than any pre-release of the same version, like 0.1.0 after 0.1.0-beta.
  if (leftPre === undefined || rightPre === undefined) {
    return compareNumbers(Number(leftPre === undefined), Number(rightPre === undefined));
  }
  return Math.sign(leftPre.localeCompare(rightPre, "en", { numeric: true }));
};

export const toUpdateStatus = (current: string, latest: string | undefined): UpdateStatus => ({
  current,
  ...(latest === undefined ? {} : { latest }),
  updateAvailable: latest !== undefined && compareVersions(latest, current) > 0,
});

export const isSavedCheckFresh = (saved: SavedCheck | undefined, now: number): boolean =>
  saved !== undefined && now - saved.checkedAt >= 0 && now - saved.checkedAt < CHECK_INTERVAL_MS;

const readSavedCheck = async (): Promise<SavedCheck | undefined> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(savedCheckPath, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "checkedAt" in parsed &&
      "latest" in parsed &&
      typeof parsed.checkedAt === "number" &&
      typeof parsed.latest === "string"
    ) {
      return { checkedAt: parsed.checkedAt, latest: parsed.latest };
    }
  } catch {
    // No saved check yet, or a broken one. Either way, ask npm.
  }
  return undefined;
};

/** Asks npm for the version its "latest" tag points at. */
export const fetchLatestVersion = async (
  packageName: string,
  registryUrl = REGISTRY_URL,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<string> => {
  const response = await fetch(`${registryUrl}/${packageName}/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`npm answered ${response.status} when asked for the latest version.`);
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("version" in body) ||
    typeof body.version !== "string"
  ) {
    throw new Error("npm's answer had no version in it.");
  }
  return body.version;
};

/**
 * Compares this copy with the newest one on npm. Automatic checks reuse a check from the last day
 * and stay quiet when they fail or are turned off. A forced check always asks npm and throws when
 * it can't. A checkout is updated with git, so it only asks npm when forced, to say what's out.
 */
export const checkForUpdate = async ({ force = false } = {}): Promise<UpdateStatus> => {
  const { name, version } = await readPackageInfo();
  if (!isInstalled && !force) {
    return toUpdateStatus(version, undefined);
  }
  return withAction("update.check", { kind: force ? "manual" : "automatic" }, async () => {
    const saved = await readSavedCheck();
    if (!force) {
      const { checkForUpdates = true } = await readConfig();
      if (!checkForUpdates) {
        return toUpdateStatus(version, undefined);
      }
      if (isSavedCheckFresh(saved, Date.now())) {
        return toUpdateStatus(version, saved?.latest);
      }
    }
    try {
      const latest = await fetchLatestVersion(name);
      await writeAtomic(savedCheckPath, `${JSON.stringify({ checkedAt: Date.now(), latest })}\n`);
      return toUpdateStatus(version, latest);
    } catch (error) {
      if (force) {
        throw error;
      }
      return toUpdateStatus(version, saved?.latest);
    }
  });
};
