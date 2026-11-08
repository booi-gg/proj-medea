import { confirm } from "@clack/prompts";
import { drawScreen } from "../../launcher/screen.ts";
import { sendHelperRequest } from "../../menubar/helper-socket.ts";
import { runCommand } from "../../shell.ts";
import { toRedhotIcon } from "../icon.ts";
import type { LauncherItem, RedhotApp } from "../types.ts";
import { APP_ID, SYSTEM_COMMANDS, runSystemCommand, toSystemValue } from "./commands.ts";
import type { SystemCommand, SystemTools } from "./commands.ts";

const TOOLS: SystemTools = {
  run: runCommand,
  askHelper: sendHelperRequest,
  isInTerminal: process.stdout.isTTY === true,
};

const confirmRun = async ({ name, symbol, confirmation }: SystemCommand): Promise<boolean> => {
  drawScreen({ title: name, icon: toRedhotIcon(symbol) });
  const answer = await confirm({ message: confirmation ?? `Run ${name}?`, initialValue: false });
  return answer === true;
};

const toItem = (command: SystemCommand): LauncherItem => ({
  value: toSystemValue(command.id),
  name: command.name,
  icon: toRedhotIcon(command.symbol),
  kind: "System",
  hint: command.hint,
  needsWindow: command.confirmation !== undefined,
  run: () => runSystemCommand(command, TOOLS, confirmRun),
});

const items: readonly LauncherItem[] = SYSTEM_COMMANDS.map(toItem);

export const systemCommands: RedhotApp = {
  id: APP_ID,
  listItems: () => [...items],
  listSettingsActions: () => [],
};
