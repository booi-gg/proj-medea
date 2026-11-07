import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { runCommand } from "../shell.ts";

// Terminal names a profile after the file it was opened from, so this file name is the profile.
const PROFILE_NAME = "Redhot";
const PROFILE_FILE = `${PROFILE_NAME}.terminal`;
const TERMINAL_PREFERENCES = "com.apple.Terminal";
// Short enough to sit out of the way, tall enough for the logo, search bar and a page of results.
const WINDOW_COLUMNS = 80;
const WINDOW_ROWS = 14;

/** A profile with only what Redhot needs, for when Terminal's own settings can't be read. */
export const toMinimalProfile = (launcherPath: string): string =>
  [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    "<dict>",
    `  <key>name</key><string>${PROFILE_NAME}</string>`,
    "  <key>type</key><string>Window Settings</string>",
    `  <key>CommandString</key><string>${escapeXml(launcherPath)}</string>`,
    "  <key>RunCommandAsShell</key><true/>",
    `  <key>columnCount</key><integer>${WINDOW_COLUMNS}</integer>`,
    `  <key>rowCount</key><integer>${WINDOW_ROWS}</integer>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");

const escapeXml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const extractProfile = async (
  preferencesPath: string,
  profileName: string,
  profilePath: string,
): Promise<void> => {
  await runCommand("plutil", [
    "-extract",
    `Window Settings.${profileName}`,
    "xml1",
    "-o",
    profilePath,
    preferencesPath,
  ]);
};

/**
 * Copies the Redhot profile, or the default one the first time, so the window keeps the person's
 * colours and font. Terminal adds a second profile when an opened file differs from the saved one,
 * so starting from the saved Redhot profile keeps it to one, and edits to it in Terminal stick.
 * Returns true when the Redhot profile didn't exist yet.
 */
const copySavedProfile = async (preferencesPath: string, profilePath: string): Promise<boolean> => {
  await runCommand("defaults", ["export", TERMINAL_PREFERENCES, preferencesPath]);
  try {
    await extractProfile(preferencesPath, PROFILE_NAME, profilePath);
    return false;
  } catch {
    const { stdout } = await runCommand("plutil", [
      "-extract",
      "Default Window Settings",
      "raw",
      preferencesPath,
    ]);
    await extractProfile(preferencesPath, stdout.trim(), profilePath);
    return true;
  }
};

const setProfileValue = async (
  profilePath: string,
  key: string,
  type: "-string" | "-bool" | "-integer",
  value: string,
): Promise<void> => {
  await runCommand("plutil", ["-replace", key, type, value, profilePath]);
};

/**
 * Writes a Terminal profile that runs the launcher as the window's only process. Opening a
 * .command file starts a login shell first, which prints "Last login" and types the launcher's
 * path before Redhot can clear the screen. Returns the profile's path.
 */
export const writeTerminalProfile = async (launcherPath: string): Promise<string> => {
  // One folder per launcher, so two windows opening at once never share a file.
  const profileDir = join(dirname(launcherPath), "terminal", basename(launcherPath, ".command"));
  const profilePath = join(profileDir, PROFILE_FILE);
  const preferencesPath = join(profileDir, "preferences.plist");
  await mkdir(profileDir, { recursive: true });
  try {
    const isNewProfile = await copySavedProfile(preferencesPath, profilePath);
    // Only a new profile gets the size, so a size changed in Terminal's settings is kept.
    if (isNewProfile) {
      await setProfileValue(profilePath, "columnCount", "-integer", String(WINDOW_COLUMNS));
      await setProfileValue(profilePath, "rowCount", "-integer", String(WINDOW_ROWS));
    }
    await setProfileValue(profilePath, "name", "-string", PROFILE_NAME);
    await setProfileValue(profilePath, "CommandString", "-string", launcherPath);
    await setProfileValue(profilePath, "RunCommandAsShell", "-bool", "YES");
  } catch {
    await writeFile(profilePath, toMinimalProfile(launcherPath));
  } finally {
    await rm(preferencesPath, { force: true });
  }
  return profilePath;
};
