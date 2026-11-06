import { clipboardHistory } from "./medea-clipboard-history/index.ts";
import { quicklinks } from "./medea-quicklinks/index.ts";
import { medeaSettings } from "./medea-settings/index.ts";
import { windowActions } from "./medea-window/index.ts";
import type { LauncherItem, MedeaApp, SettingsAction } from "./types.ts";

const medeaApps: readonly MedeaApp[] = [quicklinks, clipboardHistory, windowActions, medeaSettings];

export const listMedeaApps = (): readonly MedeaApp[] => medeaApps;

export const listMedeaItems = (): LauncherItem[] => medeaApps.flatMap((app) => app.listItems());

export const findMedeaItem = (itemValue: string | undefined): LauncherItem | undefined =>
  listMedeaItems().find((item) => item.value === itemValue);

export const listSettingsActions = (itemValue: string): SettingsAction[] =>
  medeaApps.flatMap((app) => app.listSettingsActions(itemValue));
