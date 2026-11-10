import { styleText } from "node:util";
import { SELECT_INSTRUCTIONS } from "@clack/prompts";

// Clack has no option for its keyboard hints, but every select menu reads this one list.
SELECT_INSTRUCTIONS.push(`${styleText("dim", "Esc:")} cancel`);
