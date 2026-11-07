import { confirm } from "@clack/prompts";
import { saveAliases } from "../../launcher/aliases.ts";
import { saveHotkey } from "../../launcher/hotkeys.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { reloadHotkeys } from "../../menubar/helper.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp, SettingsAction } from "../types.ts";
import { askForAnswers, askForQuicklink } from "./form.ts";
import { openTarget, readClipboard } from "./open-link.ts";
import { fillLink, findArguments, usesClipboard } from "./placeholders.ts";
import { addQuicklink, readQuicklinksSync, removeQuicklink, updateQuicklink } from "./store.ts";
import type { Quicklink } from "./store.ts";

const APP_ID = "redhot-quicklinks";
// Reserved, so no saved link can end up with the same value as the create command.
const CREATE_ID = "create";
const LINK_ICON = toRedhotIcon("↗");
const CREATE_NAME = "Quicklink, Create";

const toValue = (id: string): string => `${APP_ID}:${id}`;

const openQuicklink = async ({ name, link, openWith }: Quicklink): Promise<string> => {
  const linkArguments = findArguments(link);
  if (linkArguments.length > 0) {
    drawScreen({ title: name, icon: LINK_ICON });
  }
  const answers = await askForAnswers(name, linkArguments);
  if (answers === undefined) {
    return "";
  }
  const clipboard = usesClipboard(link) ? await readClipboard() : "";
  await openTarget(fillLink(link, { answers, clipboard }), openWith);
  return "";
};

const createQuicklink = async (): Promise<string> => {
  drawScreen({ title: CREATE_NAME, icon: LINK_ICON });
  const draft = await askForQuicklink(undefined, readQuicklinksSync());
  if (draft === undefined) {
    return "";
  }
  await addQuicklink(draft, [CREATE_ID]);
  return `Saved ${draft.name}`;
};

const toItem = (quicklink: Quicklink): LauncherItem => ({
  value: toValue(quicklink.id),
  name: quicklink.name,
  icon: LINK_ICON,
  kind: "Quicklink",
  needsWindow: findArguments(quicklink.link).length > 0,
  run: () => openQuicklink(quicklink),
});

const createItem: LauncherItem = {
  value: toValue(CREATE_ID),
  name: CREATE_NAME,
  icon: LINK_ICON,
  kind: "Command",
  needsWindow: true,
  run: createQuicklink,
};

const editQuicklink = async (quicklink: Quicklink): Promise<boolean> => {
  drawScreen({ title: `Edit ${quicklink.name}`, icon: LINK_ICON });
  const draft = await askForQuicklink(quicklink, readQuicklinksSync());
  if (draft !== undefined) {
    await updateQuicklink(quicklink.id, draft);
  }
  return true;
};

const deleteQuicklink = async ({ id, name }: Quicklink): Promise<boolean> => {
  const answer = await confirm({
    message: `Delete ${name}?`,
    initialValue: false,
  });
  if (answer !== true) {
    return true;
  }
  await removeQuicklink(id);
  await saveAliases(toValue(id), []);
  await saveHotkey(toValue(id), "");
  await reloadHotkeys();
  return false;
};

const listSettingsActions = (itemValue: string): SettingsAction[] => {
  const quicklink = readQuicklinksSync().find(({ id }) => toValue(id) === itemValue);
  if (quicklink === undefined) {
    return [];
  }
  return [
    { label: "Edit link", run: () => editQuicklink(quicklink) },
    { label: "Delete link", run: () => deleteQuicklink(quicklink) },
  ];
};

export const quicklinks: RedhotApp = {
  id: APP_ID,
  listItems: () => [createItem, ...readQuicklinksSync().map(toItem)],
  listSettingsActions,
};
