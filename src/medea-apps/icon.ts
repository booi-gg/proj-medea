import { styleText } from "node:util";

/** The colour is reserved for Medea's own apps and commands, so nothing else may use it. */
export const toMedeaIcon = (symbol: string): string => styleText("magenta", symbol);
