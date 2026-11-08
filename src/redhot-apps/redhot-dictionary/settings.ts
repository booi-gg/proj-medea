import { isCancel, text } from "@clack/prompts";
import { DEFAULT_DEFINE_PHRASES, readConfig, updateConfig } from "../../config.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { toRedhotIcon } from "../icon.ts";
import { parsePhrases } from "./phrases.ts";

const SCREEN_TITLE = { title: "Dictionary Phrases", icon: toRedhotIcon("¶") };
const SEPARATOR = ", ";

/** Resolves to the line to show under the Settings title. */
export const runDictionarySettings = async (): Promise<string> => {
  const { definePhrases: phrases = DEFAULT_DEFINE_PHRASES } = await readConfig();
  drawScreen(SCREEN_TITLE);
  const input = await text({
    message: "Phrases that open a definition, separated by commas. Blank restores the defaults",
    initialValue: phrases.join(SEPARATOR),
  });
  if (isCancel(input)) {
    return "";
  }
  const entered = parsePhrases(input ?? "");
  const definePhrases = entered.length === 0 ? [...DEFAULT_DEFINE_PHRASES] : entered;
  if (definePhrases.join(SEPARATOR) === phrases.join(SEPARATOR)) {
    return "";
  }
  await updateConfig({ definePhrases });
  return entered.length === 0
    ? "Dictionary phrases are back to the defaults"
    : `Saved ${entered.length} dictionary phrases`;
};
