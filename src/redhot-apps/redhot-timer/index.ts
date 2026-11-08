import { sendHelperRequest } from "../../menubar/helper-socket.ts";
import { encodeNotice } from "../../menubar/notice.ts";
import type { Notice } from "../../menubar/notice.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { formatDuration, toTimerSeconds } from "./duration.ts";

const APP_ID = "redhot-timer";
export const TIMER_VALUE = `${APP_ID}:start`;
const ICON = toRedhotIcon("◔");
const POMODORO_SECONDS = 25 * 60;
const NO_HELPER_MESSAGE = 'Timers need the menu bar item. Use Add "Redhot" to Menu Bar first';
const OLD_HELPER_MESSAGE = "The menu bar item is out of date. Run redhot restart, then try again";

// The keys are the helper's replies, from native/Countdown.swift.
const STARTED_REPLY = "started";
const REPLACED_REPLY = "replaced";
const CANCELLED_REPLY = "cancelled";
const NOTHING_RUNNING_REPLY = "none";

const sendTimerRequest = async (request: string): Promise<string> => {
  const reply = await sendHelperRequest(`timer ${request}`);
  if (reply === undefined) {
    throw new Error(NO_HELPER_MESSAGE);
  }
  return reply;
};

const startCountdown = async (
  name: string,
  seconds: number,
  doneNotice: Notice,
): Promise<string> => {
  const reply = await sendTimerRequest(`start ${seconds} ${encodeNotice(doneNotice)}`);
  if (reply !== STARTED_REPLY && reply !== REPLACED_REPLY) {
    throw new Error(OLD_HELPER_MESSAGE);
  }
  const started = `${name} set for ${formatDuration(seconds)}`;
  return reply === REPLACED_REPLY ? `${started}, replacing the one that was running` : started;
};

const cancelCountdown = async (): Promise<string> => {
  const reply = await sendTimerRequest("cancel");
  if (reply === CANCELLED_REPLY) {
    return "Timer cancelled";
  }
  if (reply === NOTHING_RUNNING_REPLY) {
    return "No timer is running";
  }
  throw new Error(OLD_HELPER_MESSAGE);
};

/** The row for a timer typed into search, or undefined when the text isn't one. */
export const toTimerItem = (query: string): LauncherItem | undefined => {
  const seconds = toTimerSeconds(query);
  if (seconds === undefined) {
    return undefined;
  }
  const length = formatDuration(seconds);
  return {
    value: TIMER_VALUE,
    name: `Timer for ${length}`,
    icon: ICON,
    kind: "Timer",
    footer: "↵ start",
    run: () => startCountdown("Timer", seconds, { title: "Time's up", message: `${length} timer` }),
  };
};

const items: readonly LauncherItem[] = [
  {
    value: `${APP_ID}:pomodoro`,
    name: "Pomodoro",
    icon: ICON,
    kind: "Timer",
    run: () =>
      startCountdown("Pomodoro", POMODORO_SECONDS, {
        title: "Pomodoro done",
        message: "Time for a break",
      }),
  },
  {
    value: `${APP_ID}:cancel`,
    name: "Timer, Cancel",
    icon: ICON,
    kind: "Command",
    run: cancelCountdown,
  },
];

export const timers: RedhotApp = {
  id: APP_ID,
  listItems: () => [...items],
  listSettingsActions: () => [],
};
