import { homedir } from "node:os";
import { sep } from "node:path";
import type { App } from "../../launcher/apps.ts";
import { toSafeName } from "../redhot-files/format.ts";
import type { AppDataItem } from "./match.ts";

const HOME_SYMBOL = "~";

export interface UninstallTools {
  isRunning: (app: App) => Promise<boolean>;
  findData: (app: App) => Promise<AppDataItem[]>;
  confirmApp: (app: App, dataCount: number) => Promise<boolean>;
  /** Resolves to undefined when the whole uninstall was called off. */
  confirmData: (app: App, data: readonly AppDataItem[]) => Promise<boolean | undefined>;
  moveToTrash: (path: string) => Promise<void>;
}

export interface UninstallResult {
  wasUninstalled: boolean;
  notice: string;
}

const NOT_UNINSTALLED: UninstallResult = { wasUninstalled: false, notice: "" };

/** Paths come from disk, so nothing in them may run in the terminal. */
export const toPathLabel = (path: string, home: string = homedir()): string =>
  toSafeName(path.startsWith(`${home}${sep}`) ? `${HOME_SYMBOL}${path.slice(home.length)}` : path);

const toItemCount = (count: number): string => `${count} data ${count === 1 ? "item" : "items"}`;

const assertNotRunning = async (app: App, { isRunning }: UninstallTools): Promise<void> => {
  if (await isRunning(app)) {
    throw new Error(`Quit ${toSafeName(app.name)} first, then uninstall it`);
  }
};

const moveApp = async (app: App, { moveToTrash }: UninstallTools): Promise<void> => {
  try {
    await moveToTrash(app.path);
  } catch (error) {
    throw new Error(
      `macOS wouldn't let Redhot move ${toSafeName(app.name)} to the Trash. ` +
        "Drag it there in Finder, which can ask for your password",
      { cause: error },
    );
  }
};

const moveData = async (
  data: readonly AppDataItem[],
  { moveToTrash }: UninstallTools,
): Promise<AppDataItem[]> => {
  const failed: AppDataItem[] = [];
  for (const item of data) {
    try {
      await moveToTrash(item.path);
    } catch {
      failed.push(item);
    }
  }
  return failed;
};

/**
 * Both questions come before anything moves, so backing out at either leaves everything as it was.
 * The data that's moved is exactly the list that was shown, and only after the app itself has gone.
 */
export const uninstallApp = async (app: App, tools: UninstallTools): Promise<UninstallResult> => {
  await assertNotRunning(app, tools);
  const data = await tools.findData(app);
  if (!(await tools.confirmApp(app, data.length))) {
    return NOT_UNINSTALLED;
  }
  const alsoMoveData = data.length === 0 ? false : await tools.confirmData(app, data);
  if (alsoMoveData === undefined) {
    return NOT_UNINSTALLED;
  }
  // The questions can stay up for a while, and it may have been opened since.
  await assertNotRunning(app, tools);
  await moveApp(app, tools);

  const name = toSafeName(app.name);
  if (!alsoMoveData) {
    const kept = data.length === 0 ? "" : `. Kept its ${toItemCount(data.length)}`;
    return { wasUninstalled: true, notice: `Moved ${name} to the Trash${kept}` };
  }
  const [firstFailure, ...otherFailures] = await moveData(data, tools);
  if (firstFailure !== undefined) {
    const others = otherFailures.length === 0 ? "" : ` and ${otherFailures.length} more`;
    throw new Error(
      `Moved ${name} to the Trash, but macOS refused ${toPathLabel(firstFailure.path)}${others}`,
    );
  }
  return {
    wasUninstalled: true,
    notice: `Moved ${name} and ${toItemCount(data.length)} to the Trash`,
  };
};
