import { toAnswerItem } from "../answer-item.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem } from "../types.ts";
import { answerDate } from "./dates.ts";
import { answerTimeZone } from "./zones.ts";

const ZONE_ICON = toRedhotIcon("◷");
const DATE_ICON = toRedhotIcon("▦");

/** The row for a time zone question typed into search, or undefined when the text isn't one. */
export const toTimeZoneItem = (query: string): LauncherItem | undefined => {
  const answer = answerTimeZone(query);
  return answer === undefined
    ? undefined
    : toAnswerItem({ ...answer, value: "redhot-time:zone", icon: ZONE_ICON, kind: "Time Zone" });
};

/** The row for a date question typed into search, or undefined when the text isn't one. */
export const toDateItem = (query: string): LauncherItem | undefined => {
  const answer = answerDate(query);
  return answer === undefined
    ? undefined
    : toAnswerItem({ ...answer, value: "redhot-time:date", icon: DATE_ICON, kind: "Date" });
};
