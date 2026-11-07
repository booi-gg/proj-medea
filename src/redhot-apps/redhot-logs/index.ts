import { mkdir } from "node:fs/promises";
import { logDir } from "../../paths.ts";
import { runCommand } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";

const APP_ID = "redhot-logs";
// Keep the value so saved aliases and hotkeys still point to this item.
const ITEM_ID = "view";

const openLogsFolder = async (): Promise<string> => {
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  await runCommand("open", [logDir]);
  return "";
};

const openFolderItem: LauncherItem = {
  value: `${APP_ID}:${ITEM_ID}`,
  name: "Logs, Open Folder",
  icon: toRedhotIcon("▤"),
  kind: "Command",
  hint: "Open the log files in Finder",
  run: openLogsFolder,
};

export const redhotLogs: RedhotApp = {
  id: APP_ID,
  listItems: () => [openFolderItem],
  listSettingsActions: () => [],
};
