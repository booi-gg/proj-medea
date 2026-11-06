import { copyText } from "../../shell.ts";
import { toMedeaIcon } from "../icon.ts";
import type { LauncherItem } from "../types.ts";
import { calculate } from "./calculate.ts";

const VALUE = "medea-calculator:answer";
const ICON = toMedeaIcon("±");

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
