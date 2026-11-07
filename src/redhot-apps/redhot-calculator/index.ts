import { copyText } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem } from "../types.ts";
import { calculate } from "./calculate.ts";

const VALUE = "redhot-calculator:answer";
const ICON = toRedhotIcon("±");

const copyAnswer = async (answer: string): Promise<string> => {
  await copyText(answer);
  return `Copied ${answer}`;
};

/** The row for a sum typed into search, or undefined when the text isn't one. */
export const toCalculationItem = (query: string): LauncherItem | undefined => {
  const answer = calculate(query);
  if (answer === undefined) {
    return undefined;
  }
  return {
    value: VALUE,
    name: `${query.trim()} = ${answer}`,
    icon: ICON,
    kind: "Calculator",
    footer: "↵ copy",
    run: () => copyAnswer(answer),
  };
};
