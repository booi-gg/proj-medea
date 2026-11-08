import { styleText } from "node:util";
import { confirm, isCancel, select, spinner } from "@clack/prompts";
import {
  DEFAULT_DEFINE_PHRASES,
  DEFAULT_HISTORY_MONTHS,
  DEFAULT_LOG_MAX_SIZE_MB,
  DEFAULT_WEB_SEARCH_ENGINE,
  HISTORY_MONTH_CHOICES,
  LOG_SIZE_CHOICES,
  readConfig,
  updateConfig,
} from "../../config.ts";
import type { HistoryMonths, LogMaxSizeMb } from "../../config.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { askForWindowAccess, readWindowAccess } from "../../menubar/helper-socket.ts";
import { chooseICloudFolder } from "../../sync/bridge.ts";
import {
  changeSyncSettings,
  configureSync,
  listSyncConflicts,
  openSyncFolder,
  readSyncStatus,
  removeThisDevicesSyncedLogs,
  resolveSyncConflict,
  setSyncChoice,
  syncNow,
  toSyncFolderName,
} from "../../sync/sync.ts";
import type { SyncChoices, SyncStatus } from "../../sync/sync.ts";
import type { WindowAccess } from "../../menubar/helper-socket.ts";
import {
  disableLoginItem,
  enableLoginItem,
  hasLoginItem,
  openLoginItemsSettings,
  readLoginItemState,
} from "../../menubar/login-item.ts";
import type { LoginItemState } from "../../menubar/login-item.ts";
import { countEntriesToRemove, removeExpiredEntries } from "../redhot-clipboard-history/store.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { runDictionarySettings } from "../redhot-dictionary/settings.ts";
import { WEB_SEARCH_ENGINES } from "../redhot-web-search/engines.ts";
import { runWebSearchSettings } from "../redhot-web-search/settings.ts";

const APP_ID = "redhot-settings";
const OPEN_ID = "open";
const NAME = "Settings";
const ICON = toRedhotIcon("⚙");
const START_AT_LOGIN = "start-at-login";
const CLIPBOARD_HISTORY = "clipboard-history";
const LOG_SIZE = "log-size";
const WINDOW_ACCESS = "window-access";
const SYNC = "sync";
const CHECK_FOR_UPDATES = "check-for-updates";
const WEB_SEARCH = "web-search";
const RECENT_PROJECTS = "recent-projects";
const RECENT_PROJECTS_LABEL = "Show recent projects in search";
const BROWSER_BOOKMARKS = "browser-bookmarks";
const BROWSER_BOOKMARKS_LABEL = "Show browser bookmarks in search";
const DICTIONARY_PHRASES = "dictionary-phrases";
const DONE = "done";
const MONTHS_IN_YEAR = 12;
const SYNC_CHOICES: readonly {
  key: keyof SyncChoices;
  label: string;
  hint: string;
}[] = [
  {
    key: "settingsEnabled",
    label: "Settings",
    hint: "Aliases, hotkeys, clipboard history length",
  },
  { key: "quicklinksEnabled", label: "Quicklinks", hint: "Names and links" },
  { key: "snippetsEnabled", label: "Snippets", hint: "Keywords and text" },
  { key: "logsEnabled", label: "Logs", hint: "Metadata only" },
];

const toErrorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const syncLabel = (status: SyncStatus): string => {
  if (!status.enabled) return "○ Off";
  if (status.paused) return "◌ Paused";
  if (status.error) return "▲ Needs attention";
  return "● On";
};

const syncDetails = (status: SyncStatus): string => {
  if (!status.enabled) return "Choose a folder in iCloud Drive";
  if (status.error) return status.error;
  if (status.lastSyncAt === undefined) return "Waiting for first sync";
  return `Last sync ${new Date(status.lastSyncAt).toLocaleString()}`;
};

const reviewSyncConflict = async (): Promise<string> => {
  const conflicts = await listSyncConflicts();
  const selected = await select({
    message: "Choose a conflicting setting or Quicklink",
    options: [
      ...conflicts.map(({ key }) => ({ value: key, label: key })),
      { value: "back", label: "Back" },
    ],
  });
  if (isCancel(selected) || selected === "back") return "";
  const choice = await select({
    message: `Resolve ${selected}`,
    options: [
      { value: "current", label: "Keep current version" },
      { value: "other", label: "Restore other version" },
      { value: "back", label: "Back" },
    ],
  });
  if (isCancel(choice) || choice === "back") return "";
  await resolveSyncConflict(selected, choice === "other");
  return `Resolved ${selected}`;
};

const summarizeSyncChoices = (status: SyncStatus): string => {
  const chosen = SYNC_CHOICES.filter(({ key }) => status[key]).map(({ label }) => label);
  return chosen.length === 0 ? "Nothing" : chosen.join(", ");
};

/** Offers Off and On with the current one selected. Undefined when it's left as it was. */
const askOnOff = async (message: string, isOn: boolean): Promise<boolean | undefined> => {
  const current = isOn ? "on" : "off";
  const choice = await select({
    message,
    initialValue: current,
    options: [
      { value: "off", label: "Off" },
      { value: "on", label: "On" },
    ],
  });
  return isCancel(choice) || choice === current ? undefined : choice === "on";
};

/** Returns the line to show next, which is blank if nothing changed. */
const chooseSyncChoice = async (
  { key, label }: (typeof SYNC_CHOICES)[number],
  isOn: boolean,
): Promise<string> => {
  if ((await askOnOff(`Sync ${label.toLowerCase()}`, isOn)) === undefined) {
    return "";
  }
  if (key === "snippetsEnabled" && !isOn) {
    const accepted = await confirm({
      message: "Snippet text is kept in iCloud Drive as plain files. Sync snippets?",
      initialValue: false,
    });
    if (accepted !== true) {
      return "";
    }
  }
  await setSyncChoice(key, !isOn);
  if (isOn && key === "snippetsEnabled") {
    return "Snippet sync turned off. What's already in the sync folder stays there";
  }
  return `${label} sync turned ${isOn ? "off" : "on"}`;
};

type SyncChoiceRow = keyof SyncChoices | "back";

const askForSyncChoice = (status: SyncStatus, initialValue: SyncChoiceRow) =>
  select<SyncChoiceRow>({
    message: "Choose what this Mac shares",
    initialValue,
    options: [
      ...SYNC_CHOICES.map(({ key, label, hint }) => ({
        value: key,
        label: `${label}  ${status[key] ? STATE_LABELS.on : STATE_LABELS.off}`,
        hint,
      })),
      { value: "back", label: "Back" },
    ],
  });

const runSyncChoices = async (): Promise<void> => {
  let notice = "";
  let focused: SyncChoiceRow = "settingsEnabled";
  while (true) {
    const status = await readSyncStatus();
    drawScreen({ title: "What to Sync", icon: ICON, notice });
    const choice = await askForSyncChoice(status, focused);
    if (isCancel(choice) || choice === "back") {
      return;
    }
    focused = choice;
    const row = SYNC_CHOICES.find(({ key }) => key === choice);
    if (row !== undefined) {
      try {
        notice = await chooseSyncChoice(row, status[row.key]);
      } catch (error) {
        notice = toErrorText(error);
      }
    }
  }
};

/** Resolves to the chosen folder's name, or undefined if the picker was closed. */
const chooseSyncFolder = async (): Promise<string | undefined> => {
  const folder = await chooseICloudFolder();
  if (folder === undefined) {
    return undefined;
  }
  await configureSync(folder);
  await syncNow();
  return toSyncFolderName(folder);
};

const runSyncSettings = async (): Promise<string> => {
  let notice = "";
  while (true) {
    const status = await readSyncStatus();
    drawScreen({ title: "iCloud Drive Sync", icon: ICON, notice });
    const whatToSyncRow = {
      value: "choices",
      label: "What to Sync",
      hint: summarizeSyncChoices(status),
    };
    const choice = await select({
      message: syncDetails(status),
      options: [
        ...(!status.enabled
          ? [{ value: "setup", label: "Choose iCloud Drive Folder" }, whatToSyncRow]
          : []),
        ...(status.enabled
          ? [
              {
                value: "now",
                label: "Sync Now",
                hint: `${status.pending} pending files`,
              },
              {
                value: "pause",
                label: status.paused ? "Resume Sync" : "Pause Sync",
              },
              whatToSyncRow,
              {
                value: "folder",
                label: `Sync Folder  ${toSyncFolderName(status.folder ?? "")}`,
                hint: "Choose another folder",
              },
              { value: "remove-logs", label: "Remove This Mac's Synced Logs" },
              ...(status.conflicts > 0
                ? [
                    {
                      value: "conflicts",
                      label: `Review conflicts  ${status.conflicts}`,
                    },
                  ]
                : []),
              { value: "open", label: "Open Sync Folder" },
              { value: "disconnect", label: "Disconnect This Mac" },
            ]
          : []),
        { value: "back", label: "Back" },
      ],
    });
    if (isCancel(choice) || choice === "back") return notice;
    try {
      if (choice === "setup") {
        const name = await chooseSyncFolder();
        if (name === undefined) continue;
        notice = "iCloud Drive sync is on";
      } else if (choice === "folder") {
        const name = await chooseSyncFolder();
        if (name === undefined) continue;
        notice = `Now syncing with ${name}`;
      } else if (choice === "choices") {
        await runSyncChoices();
        notice = "";
      } else if (choice === "now") {
        await syncNow();
        notice = "Sync finished";
      } else if (choice === "pause") {
        await changeSyncSettings({ paused: !status.paused });
        notice = status.paused ? "Sync resumed" : "Sync paused";
      } else if (choice === "conflicts") {
        notice = await reviewSyncConflict();
      } else if (choice === "remove-logs") {
        const confirmed = await confirm({
          message: "Remove this Mac's uploaded logs from iCloud Drive?",
          initialValue: false,
        });
        if (confirmed === true) {
          await removeThisDevicesSyncedLogs();
          notice = "This Mac's synced logs were removed";
        }
      } else if (choice === "open") {
        await openSyncFolder();
        notice = "Opened sync folder";
      } else if (choice === "disconnect") {
        const confirmed = await confirm({
          message: "Disconnect this Mac? Local settings and links will stay.",
          initialValue: false,
        });
        if (confirmed === true) {
          await changeSyncSettings({ disconnect: true });
          notice = "Sync disconnected";
        }
      }
    } catch (error) {
      notice = toErrorText(error);
    }
  }
};

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
  return "Turn on redhot-status under Accessibility, then come back";
};

const chooseStartAtLogin = async (state: LoginItemState): Promise<string> => {
  if (state === "blocked") {
    await openLoginItemsSettings();
    return 'Turn on redhot-status under "Allow in the Background", then come back';
  }
  const choice = await select({
    message: "Start at login",
    initialValue: state,
    options: [
      { value: "off", label: "Off" },
      { value: "on", label: "On" },
    ],
  });
  if (isCancel(choice) || choice === state) {
    return "";
  }
  if (choice === "off") {
    await disableLoginItem();
    return "Redhot won't start at login";
  }
  await enableLoginItem();
  return 'Redhot will start at login. macOS may show a "Background Items Added" notice';
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
    options: HISTORY_MONTH_CHOICES.map((value) => ({
      value,
      label: toMonthsLabel(value),
    })),
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

const chooseUpdateChecks = async (isOn: boolean): Promise<string> => {
  const checkForUpdates = await askOnOff("Check for updates", isOn);
  if (checkForUpdates === undefined) {
    return "";
  }
  await updateConfig({ checkForUpdates });
  return checkForUpdates
    ? "Redhot will check npm for updates once a day"
    : "Redhot won't check for updates. Use Check for Updates in the menu bar";
};

const chooseRecentProjects = async (isOn: boolean): Promise<string> => {
  const recentProjects = await askOnOff(RECENT_PROJECTS_LABEL, isOn);
  if (recentProjects === undefined) {
    return "";
  }
  await updateConfig({ recentProjects });
  return recentProjects
    ? "Recent projects will show in search"
    : "Recent projects won't show in search";
};

const chooseBrowserBookmarks = async (isOn: boolean): Promise<string> => {
  const browserBookmarks = await askOnOff(BROWSER_BOOKMARKS_LABEL, isOn);
  if (browserBookmarks === undefined) {
    return "";
  }
  await updateConfig({ browserBookmarks });
  return browserBookmarks
    ? "Browser bookmarks will show in search"
    : "Browser bookmarks won't show in search";
};

/** Shows the menu once. Returns the line to show next, or undefined when finished. */
const runSettingsRound = async (notice: string): Promise<string | undefined> => {
  drawScreen({ title: "Settings", icon: ICON, notice });
  const [
    state,
    {
      clipboardHistoryMonths = DEFAULT_HISTORY_MONTHS,
      logMaxSizeMb = DEFAULT_LOG_MAX_SIZE_MB,
      checkForUpdates = true,
      webSearchEngine = DEFAULT_WEB_SEARCH_ENGINE,
      recentProjects = false,
      browserBookmarks = false,
      definePhrases = DEFAULT_DEFINE_PHRASES,
    },
    windowAccess,
    syncStatus,
  ] = await Promise.all([checkLoginItem(), readConfig(), readWindowAccess(), readSyncStatus()]);
  const choice = await select({
    message: "Choose a setting",
    options: [
      {
        value: START_AT_LOGIN,
        label: `Start at login  ${STATE_LABELS[state]}`,
        hint: "Keeps Redhot in the menu bar",
      },
      {
        value: CLIPBOARD_HISTORY,
        label: `Keep clipboard history  ${toMonthsLabel(clipboardHistoryMonths)}`,
        hint: "Older entries are deleted",
      },
      {
        value: LOG_SIZE,
        label: `Log size  ${logMaxSizeMb} MB`,
        hint: "Oldest logs removed at limit",
      },
      {
        value: WINDOW_ACCESS,
        label: `Window actions  ${WINDOW_ACCESS_LABELS[windowAccess]}`,
        hint: "Moves and resizes other apps' windows",
      },
      {
        value: SYNC,
        label: `iCloud Drive Sync  ${syncLabel(syncStatus)}`,
        hint: syncDetails(syncStatus),
      },
      {
        value: CHECK_FOR_UPDATES,
        label: `Check for updates  ${checkForUpdates ? STATE_LABELS.on : STATE_LABELS.off}`,
        hint: "Asks npm once a day",
      },
      {
        value: WEB_SEARCH,
        label: `Web search ${WEB_SEARCH_ENGINES[webSearchEngine].name}`,
      },
      {
        value: RECENT_PROJECTS,
        label: `${RECENT_PROJECTS_LABEL}  ${recentProjects ? STATE_LABELS.on : STATE_LABELS.off}`,
      },
      {
        value: BROWSER_BOOKMARKS,
        label: `${BROWSER_BOOKMARKS_LABEL}  ${browserBookmarks ? STATE_LABELS.on : STATE_LABELS.off}`,
      },
      {
        value: DICTIONARY_PHRASES,
        label: `Dictionary phrases  ${definePhrases.length}`,
        hint: "What opens a definition in search",
      },
      { value: DONE, label: "Done" },
    ],
  });
  if (isCancel(choice) || choice === DONE) {
    return undefined;
  }
  if (choice === CHECK_FOR_UPDATES) {
    return chooseUpdateChecks(checkForUpdates);
  }
  if (choice === WEB_SEARCH) {
    return runWebSearchSettings(webSearchEngine);
  }
  if (choice === RECENT_PROJECTS) {
    return chooseRecentProjects(recentProjects);
  }
  if (choice === BROWSER_BOOKMARKS) {
    return chooseBrowserBookmarks(browserBookmarks);
  }
  if (choice === DICTIONARY_PHRASES) {
    return runDictionarySettings();
  }
  if (choice === WINDOW_ACCESS) {
    return fixWindowAccess(windowAccess);
  }
  if (choice === SYNC) {
    return runSyncSettings();
  }
  if (choice === LOG_SIZE) {
    return chooseLogSize(logMaxSizeMb);
  }
  return choice === CLIPBOARD_HISTORY
    ? chooseHistoryMonths(clipboardHistoryMonths)
    : chooseStartAtLogin(state);
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

export const redhotSettings: RedhotApp = {
  id: APP_ID,
  listItems: () => [openItem],
  listSettingsActions: () => [],
};
