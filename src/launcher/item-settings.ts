import { cancel, intro, isCancel, outro, text } from "@clack/prompts";
import { readConfig } from "../config.ts";
import { findAliasProblem, parseAliasInput, saveAliases } from "./aliases.ts";

/** The settings screen for one app or command. It runs in its own terminal window. */
export const runItemSettings = async (itemValue: string, itemName: string): Promise<void> => {
  const { aliases } = await readConfig();
  intro(itemName);

  const input = await text({
    message: "Aliases, separated by commas",
    placeholder: "Leave empty for none",
    initialValue: (aliases[itemValue] ?? []).join(", "),
    validate: (value) => findAliasProblem(parseAliasInput(value ?? ""), itemValue, aliases),
  });

  if (isCancel(input)) {
    cancel("Nothing changed");
    return;
  }
  await saveAliases(itemValue, parseAliasInput(input));
  outro("Saved");
};
