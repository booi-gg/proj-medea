import { mkdir } from "node:fs/promises";
import { logDir } from "../../paths.ts";
import { runCommand } from "../../shell.ts";
import { toMedeaIcon } from "../icon.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";

const APP_ID = "medea-logs";
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
  icon: toMedeaIcon("▤"),
  kind: "Command",
  hint: "Open the log files in Finder",
  run: openLogsFolder,
};

export const medeaLogs: MedeaApp = {
  id: APP_ID,
  listItems: () => [openFolderItem],
  listSettingsActions: () => [],
};
