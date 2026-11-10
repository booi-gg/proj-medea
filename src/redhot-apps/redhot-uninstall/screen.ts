import { dirname } from "node:path";
import { styleText } from "node:util";
import { confirm, isCancel, log } from "@clack/prompts";
import { listApps } from "../../launcher/apps.ts";
import type { App } from "../../launcher/apps.ts";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen, fitToColumns, toTerminalWidth } from "../../launcher/screen.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { toRedhotIcon } from "../icon.ts";
import { canUninstall, findDataFor, isAppRunning } from "./bundle.ts";
import type { AppDataItem } from "./match.ts";
import { moveToTrash } from "./trash.ts";
import { toPathLabel, uninstallApp } from "./uninstall.ts";
import type { UninstallResult, UninstallTools } from "./uninstall.ts";

export const SCREEN_NAME = "Uninstall Apps";
export const SCREEN_ICON = toRedhotIcon("⌫");
const TITLE = { title: SCREEN_NAME, icon: SCREEN_ICON };
const PLACEHOLDER = "Search for the app to move to the Trash";
const NOTHING_MATCHES = "No apps that can be uninstalled match";
const FOOTER = "↵ uninstall";
const FALLBACK_COLUMNS = 80;
// Room for the focus marker and the margins.
const ROW_MARGIN = 8;
const COLUMN_GAP = "  ";
// Below this a folder is too cut down to tell anything apart.
const MIN_FOLDER_WIDTH = 10;

const toRow = ({ name, path }: App, width: number): string => {
  const shownName = fitToColumns(toSafeName(name), width);
  const room = width - toTerminalWidth(shownName) - COLUMN_GAP.length;
  if (room < MIN_FOLDER_WIDTH) {
    return shownName;
  }
  const folder = fitToColumns(toPathLabel(dirname(path)), room);
  return `${shownName}${COLUMN_GAP}${styleText("gray", folder)}`;
};

const toOption = (app: App, width: number): LauncherOption => ({
  value: app.path,
  name: app.name,
  aliases: [],
  label: toRow(app, width),
  footer: FOOTER,
});

const pickApp = async (): Promise<App | undefined> => {
  drawScreen(TITLE);
  const apps = (await listApps()).filter(({ path }) => canUninstall(path));
  const width = (process.stdout.columns ?? FALLBACK_COLUMNS) - ROW_MARGIN;
  const options = apps.map((app) => toOption(app, width));
  const { cancelled, value } = await promptForSelection(() => options, PLACEHOLDER, {
    listWhenEmpty: true,
    replaceable: true,
    enterLabel: "uninstall",
    getEmptyText: () => NOTHING_MATCHES,
  });
  return cancelled ? undefined : apps.find(({ path }) => path === value);
};

const confirmApp = async ({ name, path }: App, dataCount: number): Promise<boolean> => {
  drawScreen(TITLE);
  const dataLine = dataCount === 0 ? "\nNo data of its own was found" : "";
  log.message(`${toPathLabel(path)}${styleText("dim", dataLine)}`);
  const answer = await confirm({
    message: `Move ${toSafeName(name)} to the Trash?`,
    initialValue: false,
  });
  return answer === true;
};

const toDataLine = ({ path, matchedBy }: AppDataItem): string => {
  const reason = matchedBy === "name" ? styleText("dim", "  (matched by folder name)") : "";
  return `${toPathLabel(path)}${reason}`;
};

const confirmData = async (
  { name }: App,
  data: readonly AppDataItem[],
): Promise<boolean | undefined> => {
  drawScreen(TITLE);
  log.message(data.map(toDataLine).join("\n"));
  const answer = await confirm({
    message: `Also move ${toSafeName(name)}'s data to the Trash? Settings and sign-ins go with it`,
    initialValue: false,
  });
  return isCancel(answer) ? undefined : answer;
};

const TOOLS: UninstallTools = {
  isRunning: isAppRunning,
  findData: findDataFor,
  confirmApp,
  confirmData,
  moveToTrash,
};

export const runUninstall = (app: App): Promise<UninstallResult> => uninstallApp(app, TOOLS);

/** Picks an app and uninstalls it. Resolves to a line to show above the search bar. */
export const runUninstallScreen = async (): Promise<string> => {
  const app = await pickApp();
  if (app === undefined) {
    return "";
  }
  const { notice } = await runUninstall(app);
  return notice;
};
