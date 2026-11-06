import { styleText } from "node:util";
import { confirm, isCancel, select, spinner } from "@clack/prompts";
import {
  DEFAULT_HISTORY_MONTHS,
  DEFAULT_LOG_MAX_SIZE_MB,
  HISTORY_MONTH_CHOICES,
  LOG_SIZE_CHOICES,
  readConfig,
  updateConfig,
} from "../../config.ts";
import type { HistoryMonths, LogMaxSizeMb } from "../../config.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { askForWindowAccess, readWindowAccess } from "../../menubar/helper-socket.ts";
import type { WindowAccess } from "../../menubar/helper-socket.ts";
import {
  disableLoginItem,
  enableLoginItem,
  hasLoginItem,
  openLoginItemsSettings,
  readLoginItemState,
} from "../../menubar/login-item.ts";
import type { LoginItemState } from "../../menubar/login-item.ts";
import { countEntriesToRemove, removeExpiredEntries } from "../medea-clipboard-history/store.ts";
import { toMedeaIcon } from "../icon.ts";
import type { LauncherItem, MedeaApp } from "../types.ts";

const APP_ID = "medea-settings";
const OPEN_ID = "open";
const NAME = "Settings";
const ICON = toMedeaIcon("⚙");
const START_AT_LOGIN = "start-at-login";
const CLIPBOARD_HISTORY = "clipboard-history";
const LOG_SIZE = "log-size";
const WINDOW_ACCESS = "window-access";
const DONE = "done";
const MONTHS_IN_YEAR = 12;

const STATE_LABELS: Record<LoginItemState, string> = {
  on: styleText("green", "● On"),
  off: styleText("gray", "○ Off"),
  blocked: styleText("yellow", "▲ Blocked in System Settings"),
};

const WINDOW_ACCESS_LABELS: Record<WindowAccess, string> = {
  granted: styleText("green", "● On"),
  missing: styleText("yellow", "▲ Needs Accessibility"),
  "no-helper": styleText("gray", "○ Menu bar item not running"),
};

const fixWindowAccess = async (access: WindowAccess): Promise<string> => {
  if (access === "granted") {
    return "Window actions are ready";
  }
  if (access === "no-helper") {
    return "Use Add Menu Bar Item first, then come back";
  }
  await askForWindowAccess();
  return "Turn on medea-status under Accessibility, then come back";
};

const toggleStartAtLogin = async (state: LoginItemState): Promise<string> => {
  if (state === "blocked") {
    await openLoginItemsSettings();
    return 'Turn on medea-status under "Allow in the Background", then come back';
  }
  if (state === "on") {
    await disableLoginItem();
    return "Medea won't start at login";
  }
  await enableLoginItem();
  return 'Medea will start at login. macOS may show a "Background Items Added" notice';
};

const checkLoginItem = async (): Promise<LoginItemState> => {
  if (!hasLoginItem()) {
    return "off";
  }
  const progress = spinner();
  progress.start("Checking System Settings");
  try {
    return await readLoginItemState();
  } finally {
    progress.clear();
  }
};

const toMonthsLabel = (months: HistoryMonths): string =>
  months === MONTHS_IN_YEAR ? "1 year" : `${months} months`;

const confirmRemoval = async (count: number, months: HistoryMonths): Promise<boolean> => {
  if (count === 0) {
    return true;
  }
  const entries = count === 1 ? "1 entry" : `${count} entries`;
  const answer = await confirm({
    message: `Delete ${entries} older than ${toMonthsLabel(months)}?`,
    initialValue: false,
  });
  return answer === true;
};

/** Returns the line to show next, which is blank if nothing changed. */
const chooseHistoryMonths = async (current: HistoryMonths): Promise<string> => {
  const months = await select({
    message: "Keep clipboard history for",
    initialValue: current,
    options: HISTORY_MONTH_CHOICES.map((value) => ({ value, label: toMonthsLabel(value) })),
  });
  if (isCancel(months) || months === current) {
    return "";
  }
  // Anything a longer history removes had already expired, so only a shorter one needs asking.
  const isShorter = months < current;
  if (isShorter && !(await confirmRemoval(await countEntriesToRemove(months), months))) {
    return "";
  }
  await updateConfig({ clipboardHistoryMonths: months });
  await removeExpiredEntries();
  return `Clipboard history is kept for ${toMonthsLabel(months)}`;
};

const chooseLogSize = async (current: LogMaxSizeMb): Promise<string> => {
  const size = await select({
    message: "Keep logs up to",
    initialValue: current,
    options: LOG_SIZE_CHOICES.map((value) => ({ value, label: `${value} MB` })),
  });
  if (isCancel(size) || size === current) {
    return "";
  }
  await updateConfig({ logMaxSizeMb: size });
  return `Logs are kept up to ${size} MB`;
};

/** Shows the menu once. Returns the line to show next, or undefined when finished. */
const runSettingsRound = async (notice: string): Promise<string | undefined> => {
  drawScreen({ title: "Settings", icon: ICON, notice });
  const [
    state,
    { clipboardHistoryMonths = DEFAULT_HISTORY_MONTHS, logMaxSizeMb = DEFAULT_LOG_MAX_SIZE_MB },
    windowAccess,
  ] = await Promise.all([checkLoginItem(), readConfig(), readWindowAccess()]);
  const choice = await select({
    message: "Choose a setting",
    options: [
      {
        value: START_AT_LOGIN,
        label: `Start at login  ${STATE_LABELS[state]}`,
        hint: "Keeps Medea in the menu bar",
      },
      {
        value: CLIPBOARD_HISTORY,
        label: `Keep clipboard history  ${toMonthsLabel(clipboardHistoryMonths)}`,
        hint: "Older entries are deleted",
      },
      {
        value: LOG_SIZE,
        label: `Log size  ${logMaxSizeMb} MB`,
        hint: "Oldest logs are removed when the limit is reached",
      },
      {
        value: WINDOW_ACCESS,
        label: `Window actions  ${WINDOW_ACCESS_LABELS[windowAccess]}`,
        hint: "Moves and resizes other apps' windows",
      },
      { value: DONE, label: "Done" },
    ],
  });
  if (isCancel(choice) || choice === DONE) {
    return undefined;
  }
  if (choice === WINDOW_ACCESS) {
    return fixWindowAccess(windowAccess);
  }
  if (choice === LOG_SIZE) {
    return chooseLogSize(logMaxSizeMb);
  }
  return choice === CLIPBOARD_HISTORY
    ? chooseHistoryMonths(clipboardHistoryMonths)
    : toggleStartAtLogin(state);
};

const openSettings = async (): Promise<string> => {
  let notice = await runSettingsRound("");
  while (notice !== undefined) {
    notice = await runSettingsRound(notice);
  }
  return "";
};

const openItem: LauncherItem = {
  value: `${APP_ID}:${OPEN_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  needsWindow: true,
  run: openSettings,
};

export const medeaSettings: MedeaApp = {
  id: APP_ID,
  listItems: () => [openItem],
  listSettingsActions: () => [],
};
