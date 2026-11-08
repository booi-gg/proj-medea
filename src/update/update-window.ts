import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { styleText } from "node:util";
import { log, spinner } from "@clack/prompts";
import { drawScreen } from "../launcher/screen.ts";
import { cliEntryPath, projectDir } from "../paths.ts";
import { toRedhotIcon } from "../redhot-apps/icon.ts";
import { runCommand } from "../shell.ts";
import { quitRunningCli } from "../terminals/running-cli.ts";
import { readPackageInfo } from "../version.ts";
import { checkForUpdate } from "./update-check.ts";
import { resolveProgram, toInstaller, toManualCommand } from "./installer.ts";
import type { Installer } from "./installer.ts";

const ICON = toRedhotIcon("↑");
// Long enough to read the last line before the window closes.
const CLOSE_DELAY_MS = 1500;
const ERROR_LINES_SHOWN = 12;
// npm can print a lot while it works, and execFile fails past its buffer.
const INSTALL_OUTPUT_LIMIT = 16 * 1024 * 1024;

const toErrorOutput = (error: unknown): string => {
  const stderr =
    typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : "";
  const message = error instanceof Error ? error.message : String(error);
  const lines = (stderr.trim() === "" ? message : stderr).trim().split("\n");
  return lines.slice(-ERROR_LINES_SHOWN).join("\n");
};

const waitForKey = async (): Promise<void> => {
  const { stdin } = process;
  if (!stdin.isTTY) {
    return;
  }
  stdin.setRawMode(true);
  stdin.resume();
  await once(stdin, "data");
  stdin.setRawMode(false);
  stdin.pause();
};

const fail = async (summary: string, error: unknown, installer?: Installer): Promise<void> => {
  log.error(summary);
  log.message(styleText("dim", toErrorOutput(error)));
  if (installer !== undefined) {
    log.info(`To update yourself, run:\n${toManualCommand(installer)}\nthen: redhot restart`);
  }
  log.message(styleText("dim", "Press any key to close"));
  process.exitCode = 1;
  await waitForKey();
};

/**
 * pnpm keeps each version in its own folder, so the new copy's entry is found through pnpm. npm
 * and Bun replace the copy in place, so the entry path stays the same.
 */
const findUpdatedEntry = async (installer: Installer, packageName: string): Promise<string> => {
  if (installer.program !== "pnpm") {
    return cliEntryPath;
  }
  try {
    const { stdout } = await runCommand("pnpm", ["root", "--global"]);
    return join(stdout.trim(), packageName, "dist", "start.js");
  } catch {
    return cliEntryPath;
  }
};

/**
 * Runs in its own window, opened from the menu bar. Everything this needs is loaded before the
 * install starts, because the install replaces this copy's files. The restart then runs the new
 * copy, which rebuilds the menu bar helper from the new version.
 */
export const runUpdateInWindow = async (): Promise<void> => {
  drawScreen({ title: "Update", icon: ICON });
  const progress = spinner();
  progress.start("Checking for a new version");
  let status: Awaited<ReturnType<typeof checkForUpdate>>;
  try {
    status = await checkForUpdate({ force: true });
  } catch (error) {
    progress.error("Couldn't check for updates");
    await fail("Check your internet connection and try again.", error);
    return;
  }
  const { current, latest } = status;
  if (!status.updateAvailable || latest === undefined) {
    progress.stop(`Redhot ${current} is up to date`);
    await delay(CLOSE_DELAY_MS);
    return;
  }

  const { name } = await readPackageInfo();
  const installer = toInstaller(projectDir, `${name}@${latest}`);
  progress.message(`Updating Redhot ${current} → ${latest}`);
  try {
    await runCommand(resolveProgram(installer.program, process.execPath), installer.args, {
      maxBuffer: INSTALL_OUTPUT_LIMIT,
    });
  } catch (error) {
    progress.error(`Couldn't install Redhot ${latest}`);
    await fail(`${installer.program} stopped with an error.`, error, installer);
    return;
  }
  progress.stop(`Installed ${latest}`);

  const restarting = spinner();
  restarting.start("Restarting the menu bar item");
  try {
    // An open search window still runs the old copy, so it quits and the next one is new.
    await quitRunningCli();
    const updatedEntry = await findUpdatedEntry(installer, name);
    await runCommand(process.execPath, [updatedEntry, "restart"]);
  } catch (error) {
    restarting.error("Couldn't restart the menu bar item");
    await fail(`Redhot ${latest} is installed. Run redhot restart to finish.`, error);
    return;
  }
  restarting.stop(`Redhot ${latest} is ready`);
  await delay(CLOSE_DELAY_MS);
};
