import { styleText } from "node:util";

/** The colour is reserved for Redhot's own apps and commands, so nothing else may use it. */
export const toRedhotIcon = (symbol: string): string => styleText("magenta", symbol);
