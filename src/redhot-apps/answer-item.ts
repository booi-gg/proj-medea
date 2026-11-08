import { copyText } from "../shell.ts";
import type { LauncherItem } from "./types.ts";

interface Answer {
  value: string;
  name: string;
  icon: string;
  kind: string;
  /** What Enter copies, which is usually less than the row shows. */
  answer: string;
}

/** A row worked out from what was typed, with no saved value for an alias or hotkey. */
export const toAnswerItem = ({ answer, ...row }: Answer): LauncherItem => ({
  ...row,
  footer: "↵ copy",
  run: async () => {
    await copyText(answer);
    return `Copied ${answer}`;
  },
});
