import { toAnswerItem } from "../answer-item.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem } from "../types.ts";
import { convertUnits } from "./units.ts";

const ICON = toRedhotIcon("⇄");

/** The row for a unit conversion typed into search, or undefined when the text isn't one. */
export const toUnitItem = (query: string): LauncherItem | undefined => {
  const conversion = convertUnits(query);
  return conversion === undefined
    ? undefined
    : toAnswerItem({ ...conversion, value: "redhot-units:answer", icon: ICON, kind: "Units" });
};
