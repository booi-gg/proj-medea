import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { isInstalled } from "../paths.ts";
import { runCommand } from "../shell.ts";

// Terminal names a profile after the file it was opened from, so this file name is the profile.
// Terminal saves a copy, "Redhot 1", whenever an opened file differs from the saved profile of the
// same name. A checkout and an installed copy write different files, so each gets its own name.
const PROFILE_NAME = isInstalled ? "Redhot" : "Redhot Dev";
const PROFILE_FILE = `${PROFILE_NAME}.terminal`;
const TERMINAL_PREFERENCES = "com.apple.Terminal";
// Short enough to sit out of the way, tall enough for the logo, search bar and a page of results.
const WINDOW_COLUMNS = 80;
const WINDOW_ROWS = 18;
// Characters that mean the same to zsh inside and outside quotes.
const PLAIN_PATH_BYTE = /[\w./-]/u;

const toHexEscape = (byte: number): string => `\\x${byte.toString(16).padStart(2, "0")}`;

/**
 * Terminal splits a profile's command at every space and ignores quotes, so an installed copy's
 * launcher in "Application Support" would run as ".../Library/Application". This hands zsh the path
 * with every byte that isn't plainly safe written as \xHH, which leaves no space for Terminal to
 * split at. zsh runs the last command of -c in its own place, so the launcher stays the only
 * process. -f skips the person's zsh startup files.
 */
export const toTerminalCommand = (launcherPath: string): string => {
  const escapedPath = [...Buffer.from(launcherPath, "utf8")]
    .map((byte) => {
      const character = String.fromCodePoint(byte);
      return byte < 0x80 && PLAIN_PATH_BYTE.test(character) ? character : toHexEscape(byte);
    })
    .join("");
  return `/bin/zsh -fc $'${escapedPath}'`;
};

/** A profile with only what Redhot needs, for when Terminal's own settings can't be read. */
export const toMinimalProfile = (launcherPath: string): string =>
  [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    "<dict>",
    `  <key>name</key><string>${PROFILE_NAME}</string>`,
    "  <key>type</key><string>Window Settings</string>",
    `  <key>CommandString</key><string>${escapeXml(toTerminalCommand(launcherPath))}</string>`,
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
 * Copies the default profile, so the window keeps the person's colours and font. Terminal adds a
 * second profile, "Redhot 1", whenever an opened file differs from the saved Redhot profile, so
 * the file must come out the same every time. Terminal also writes its settings late, so a saved
 * Redhot profile read back here can be out of date, which is why it's never the starting point.
 */
const copyDefaultProfile = async (preferencesPath: string, profilePath: string): Promise<void> => {
  await runCommand("defaults", ["export", TERMINAL_PREFERENCES, preferencesPath]);
  const { stdout } = await runCommand("plutil", [
    "-extract",
    "Default Window Settings",
    "raw",
    preferencesPath,
  ]);
  await extractProfile(preferencesPath, stdout.trim(), profilePath);
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
    await copyDefaultProfile(preferencesPath, profilePath);
    await setProfileValue(profilePath, "columnCount", "-integer", String(WINDOW_COLUMNS));
    await setProfileValue(profilePath, "rowCount", "-integer", String(WINDOW_ROWS));
    await setProfileValue(profilePath, "name", "-string", PROFILE_NAME);
    await setProfileValue(profilePath, "CommandString", "-string", toTerminalCommand(launcherPath));
    await setProfileValue(profilePath, "RunCommandAsShell", "-bool", "YES");
  } catch {
    await writeFile(profilePath, toMinimalProfile(launcherPath));
  } finally {
    await rm(preferencesPath, { force: true });
  }
  return profilePath;
};
