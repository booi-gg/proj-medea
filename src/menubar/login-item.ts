import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { dirname } from "node:path";
import { cliEntryPath, helperLogPath, helperPath, loginItemPath } from "../paths.ts";
import { writeLog } from "../log.ts";
import { runCommand } from "../shell.ts";
import { prepareMenuBar } from "./helper.ts";

export const LOGIN_ITEM_LABEL = "redhot.menu-bar";
const LOGIN_ITEMS_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.LoginItems-Settings.extension";

const BTM_RECORD_START = /^\s*#\d+:/m;
const BTM_DISABLED = /Disposition: \[disabled/;

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const XML_SPECIAL_CHARACTERS = /[&<>]/g;

export type LoginItemState = "on" | "off" | "blocked";

const escapeXml = (value: string): string =>
  value.replaceAll(XML_SPECIAL_CHARACTERS, (character) => XML_ESCAPES[character] ?? character);

/**
 * RunAtLoad starts the helper at login. There is no KeepAlive, so Exit in the menu bar stays exited
 * until the next login. Aqua limits it to a real desktop session, where a menu bar exists.
 */
export const toLaunchAgentPlist = (
  programArguments: readonly string[],
  logPath: string,
): string => {
  const argumentLines = programArguments.map((part) => `    <string>${escapeXml(part)}</string>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${LOGIN_ITEM_LABEL}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...argumentLines,
    "  </array>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>LimitLoadToSessionType</key>",
    "  <string>Aqua</string>",
    "  <key>StandardOutPath</key>",
    `  <string>${escapeXml(logPath)}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${escapeXml(logPath)}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
};

/** Reads "launchctl print-disabled" for this item. */
export const isDisabledByLaunchd = (printDisabledOutput: string): boolean =>
  printDisabledOutput.includes(`"${LOGIN_ITEM_LABEL}" => disabled`);

/** Reads "sfltool dumpbtm", which shows the switch in System Settings. */
export const isSwitchedOffInSettings = (backgroundItemsDump: string): boolean =>
  backgroundItemsDump
    .split(BTM_RECORD_START)
    .some((record) => record.includes(`.${LOGIN_ITEM_LABEL}\n`) && BTM_DISABLED.test(record));

const readBackgroundItems = async (): Promise<string> => {
  try {
    const { stdout } = await runCommand("sfltool", ["dumpbtm"]);
    return stdout;
  } catch (error) {
    writeLog("login-item.read-failed", { error }, { level: "warn" });
    // Apple doesn't document this tool, so losing it must not break the settings screen.
    return "";
  }
};

const writeLoginItem = async (): Promise<void> => {
  await mkdir(dirname(loginItemPath), { recursive: true });
  const programArguments = [helperPath, process.execPath, cliEntryPath];
  await writeFile(loginItemPath, toLaunchAgentPlist(programArguments, helperLogPath));
};

/** The file is the setting, so there's no saved value to disagree with what macOS will do. */
export const hasLoginItem = (): boolean => existsSync(loginItemPath);

/** Takes a few seconds when a login item exists, because sfltool is slow. */
export const readLoginItemState = async (): Promise<LoginItemState> => {
  if (!hasLoginItem()) {
    return "off";
  }
  const [{ stdout: disabledList }, backgroundItems] = await Promise.all([
    runCommand("launchctl", ["print-disabled", `gui/${userInfo().uid}`]),
    readBackgroundItems(),
  ]);
  const isBlocked = isDisabledByLaunchd(disabledList) || isSwitchedOffInSettings(backgroundItems);
  return isBlocked ? "blocked" : "on";
};

/**
 * Only writes the file, which macOS loads at the next login. Loading it now would start a second
 * helper beside the running one.
 */
export const enableLoginItem = async (): Promise<void> => {
  await prepareMenuBar();
  await writeLoginItem();
};

/** Only removes the file, so a helper started at login keeps running until you quit it. */
export const disableLoginItem = async (): Promise<void> => {
  await rm(loginItemPath, { force: true });
};

/** Keeps the saved paths right after Node or the project moves. */
export const refreshLoginItem = async (): Promise<void> => {
  if (hasLoginItem()) {
    await writeLoginItem();
  }
};

/** macOS has no command for this switch, so all Redhot can do is open the page. */
export const openLoginItemsSettings = async (): Promise<void> => {
  await runCommand("open", [LOGIN_ITEMS_SETTINGS_URL]);
};
