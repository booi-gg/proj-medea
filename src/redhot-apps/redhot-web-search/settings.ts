import { isCancel, multiselect, select } from "@clack/prompts";
import { WEB_SEARCH_ENGINE_CHOICES, readConfig, updateConfig } from "../../config.ts";
import type { WebSearchEngine } from "../../config.ts";
import { saveAliases } from "../../launcher/aliases.ts";
import { addQuicklink, readQuicklinksSync, toQuicklinkValue } from "../redhot-quicklinks/store.ts";
import { WEB_SEARCH_ENGINES, isAliasTaken, listAddableEngines, toAddedMessage } from "./engines.ts";
import type { ReadyMadeEngine } from "./engines.ts";

const CHOOSE_ENGINE = "engine";
const ADD_ENGINES = "add";
const BACK = "back";

const chooseEngine = async (current: WebSearchEngine): Promise<string> => {
  const engine = await select({
    message: "When search finds nothing, search with",
    initialValue: current,
    options: WEB_SEARCH_ENGINE_CHOICES.map((value) => ({
      value,
      label: WEB_SEARCH_ENGINES[value].name,
    })),
  });
  if (isCancel(engine) || engine === current) {
    return "";
  }
  await updateConfig({ webSearchEngine: engine });
  return `Search now falls back to ${WEB_SEARCH_ENGINES[engine].name}`;
};

/** Resolves to true when it could save the engine's usual alias. */
const addEngine = async ({ name, link, alias }: ReadyMadeEngine): Promise<boolean> => {
  const id = await addQuicklink({ name, link }, []);
  const { aliases } = await readConfig();
  if (isAliasTaken(alias, aliases)) {
    return false;
  }
  await saveAliases(toQuicklinkValue(id), [alias]);
  return true;
};

const addEngines = async (): Promise<string> => {
  const addable = listAddableEngines(readQuicklinksSync());
  if (addable.length === 0) {
    return "All the ready-made search engines are already added";
  }
  const chosen = await multiselect({
    message: "Add search quicklinks. Space picks, Enter adds",
    required: false,
    options: addable.map((engine) => ({
      value: engine,
      label: engine.name,
      hint: `${engine.alias} and a search`,
    })),
  });
  if (isCancel(chosen) || chosen.length === 0) {
    return "";
  }
  const withoutAlias: ReadyMadeEngine[] = [];
  // One at a time, because each save rewrites the whole file.
  for (const engine of chosen) {
    if (!(await addEngine(engine))) {
      withoutAlias.push(engine);
    }
  }
  return toAddedMessage(chosen, withoutAlias);
};

/** Resolves to the line to show under the Settings title. */
export const runWebSearchSettings = async (current: WebSearchEngine): Promise<string> => {
  const choice = await select({
    message: "Web search",
    options: [
      { value: CHOOSE_ENGINE, label: `Fallback engine  ${WEB_SEARCH_ENGINES[current].name}` },
      { value: ADD_ENGINES, label: "Add search quicklinks", hint: "GitHub, YouTube, npm and more" },
      { value: BACK, label: "Back" },
    ],
  });
  if (isCancel(choice) || choice === BACK) {
    return "";
  }
  return choice === CHOOSE_ENGINE ? chooseEngine(current) : addEngines();
};
