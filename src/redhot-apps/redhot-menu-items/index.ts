import { styleText } from "node:util";
import { promptForSelection } from "../../launcher/prompt.ts";
import type { LauncherOption } from "../../launcher/prompt.ts";
import { drawScreen } from "../../launcher/screen.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp, RunContext } from "../types.ts";
import { rankMenuItems, toMenuRow, toPathText } from "./format.ts";
import { pressMenuItem, readPreviousAppMenu } from "./menu.ts";
import type { AppMenu } from "./menu.ts";

const APP_ID = "redhot-menu-items";
const SEARCH_ID = "search";
const NAME = "Search Menu Items";
const ICON = toRedhotIcon("≡");
const FOOTER = "↵ run";
const TURNED_OFF_FOOTER = "↵ try anyway, it looks turned off";
const FALLBACK_COLUMNS = 80;
const FALLBACK_ROWS = 24;
// Room for the focus marker and the margins.
const ROW_MARGIN = 8;

interface ListState {
  query: string;
  notice: string;
  focused: string | undefined;
}

interface Round extends ListState {
  isFinished: boolean;
}

interface Session {
  menu: AppMenu;
  options: readonly LauncherOption[];
  maxRows: number;
  closesWhenDone: boolean;
}

const toOptions = ({ items }: AppMenu, width: number): LauncherOption[] =>
  items.map((item, index) => ({
    value: String(index),
    name: item.path.at(-1) ?? "",
    aliases: [toPathText(item.path)],
    label: toMenuRow(item, width),
    footer: item.isEnabled ? FOOTER : TURNED_OFF_FOOTER,
  }));

const toTitle = ({ app }: AppMenu): string => `${NAME} in ${toSafeName(app)}`;

const toOpeningNotice = ({ app, isPartial }: AppMenu): string =>
  isPartial ? styleText("dim", `Only part of ${toSafeName(app)}'s menus could be read`) : "";

/** Shows the list once. */
const runRound = async (
  { menu, options, maxRows, closesWhenDone }: Session,
  { query: initialQuery, notice, focused: initialFocus }: ListState,
): Promise<Round> => {
  drawScreen({ title: toTitle(menu), icon: ICON, notice });
  const { cancelled, value, wantsSettings, query } = await promptForSelection(
    () => options,
    "Search this app's menus",
    {
      listWhenEmpty: true,
      rank: rankMenuItems,
      enterLabel: "run",
      replaceable: true,
      initialQuery,
      initialFocus,
      maxVisibleResults: maxRows,
      getEmptyText: () => "No menu item matches",
    },
  );
  const finished: Round = { isFinished: true, notice: "", query, focused: undefined };
  const backToList = (nextNotice: string): Round => ({
    isFinished: false,
    notice: nextNotice,
    query,
    focused: value,
  });
  if (cancelled) {
    return finished;
  }
  // Enter with nothing listed has nothing to run. Tab lands here too: a menu item has no settings,
  // and running something like Quit by accident would be worse than doing nothing.
  const item = value === undefined ? undefined : menu.items[Number(value)];
  if (item === undefined || wantsSettings) {
    return backToList("");
  }
  try {
    await pressMenuItem(menu, item);
    // Focus has gone back to the other app, so there's nobody here to read a notice.
    return finished;
  } catch (error) {
    // A window that's closing shows this as it exits. Otherwise it goes above the results.
    if (closesWhenDone) {
      throw error;
    }
    return backToList(styleText("red", error instanceof Error ? error.message : String(error)));
  }
};

// The list is loaded late because it needs the registry, which loads this file.
const runMenuSearch = async ({ closesWhenDone }: RunContext): Promise<string> => {
  drawScreen({ title: NAME, icon: ICON, notice: styleText("dim", "Reading menus…") });
  const menu = await readPreviousAppMenu();
  if (menu.items.length === 0) {
    throw new Error(`${toSafeName(menu.app)} has no menus Redhot can read`);
  }
  const { toVisibleRows } = await import("../../launcher/hotkey-list.ts");
  const session: Session = {
    menu,
    options: toOptions(menu, (process.stdout.columns ?? FALLBACK_COLUMNS) - ROW_MARGIN),
    maxRows: toVisibleRows(process.stdout.rows ?? FALLBACK_ROWS),
    closesWhenDone,
  };
  let round = await runRound(session, {
    query: "",
    notice: toOpeningNotice(menu),
    focused: undefined,
  });
  while (!round.isFinished) {
    round = await runRound(session, round);
  }
  return round.notice;
};

const searchItem: LauncherItem = {
  value: `${APP_ID}:${SEARCH_ID}`,
  name: NAME,
  icon: ICON,
  kind: "Command",
  hint: "Find and run a menu item in the app you just used",
  needsWindow: true,
  run: (context = { closesWhenDone: false }) => runMenuSearch(context),
};

export const menuItems: RedhotApp = {
  id: APP_ID,
  listItems: () => [searchItem],
  listSettingsActions: () => [],
};
