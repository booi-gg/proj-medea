import { drawScreen } from "../../launcher/screen.ts";
import { buildColourSampler } from "../../menubar/helper.ts";
import { colourSamplerPath } from "../../paths.ts";
import { runCommand } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { parseSample, toHex } from "./colour.ts";
import { rememberColour, readHistorySync } from "./history.ts";
import { chooseFormat, chooseFromHistory } from "./screen.ts";

const APP_ID = "redhot-colour-picker";
const PICK_ID = "pick";
const HISTORY_ID = "history";
const ICON = toRedhotIcon("◉");
const PICK_NAME = "Colour Picker";
const HISTORY_NAME = "Colour History";
const PICK_TITLE = { title: PICK_NAME, icon: ICON };
const HISTORY_TITLE = { title: HISTORY_NAME, icon: ICON };

const pickColour = async (): Promise<string> => {
  drawScreen({ ...PICK_TITLE, notice: "Click a colour anywhere on screen. Esc cancels" });
  await buildColourSampler();
  const { stdout } = await runCommand(colourSamplerPath);
  const colour = parseSample(stdout);
  if (colour === undefined) {
    return "";
  }
  await rememberColour(toHex(colour));
  return chooseFormat(colour, PICK_TITLE);
};

const showHistory = async (): Promise<string> => {
  const history = readHistorySync();
  if (history.length === 0) {
    return `No colours yet. Search ${PICK_NAME} to pick one`;
  }
  const colour = await chooseFromHistory(history, HISTORY_TITLE);
  return colour === undefined ? "" : chooseFormat(colour, HISTORY_TITLE);
};

const pickItem: LauncherItem = {
  value: `${APP_ID}:${PICK_ID}`,
  name: PICK_NAME,
  icon: ICON,
  kind: "Command",
  hint: "Copy a colour from anywhere on screen",
  needsWindow: true,
  run: pickColour,
};

const historyItem: LauncherItem = {
  value: `${APP_ID}:${HISTORY_ID}`,
  name: HISTORY_NAME,
  icon: ICON,
  kind: "Command",
  hint: "Copy a colour you picked earlier",
  needsWindow: true,
  run: showHistory,
};

export const colourPicker: RedhotApp = {
  id: APP_ID,
  listItems: () => [pickItem, historyItem],
  listSettingsActions: () => [],
};
