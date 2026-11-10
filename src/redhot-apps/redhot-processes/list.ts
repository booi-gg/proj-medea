import { userInfo } from "node:os";
import { basename } from "node:path";
import { listApps } from "../../launcher/apps.ts";
import { writeLog } from "../../log.ts";
import { LSOF_PATH, runCommand } from "../../shell.ts";

// The command goes last because it's the only column that can have spaces in it.
const PS_COLUMNS = "pid=,user=,%cpu=,rss=,comm=";
const PS_LINE = /^\s*(\d+)\s+(\S+)\s+([\d.,]+)\s+(\d+)\s+(.+?)\s*$/u;
const APP_EXECUTABLE = /([^/]+)\.app\/Contents\/MacOS\/[^/]+$/u;
const PORT_QUERY = /^port\s+(\d+)\s*$/iu;
const MAX_PORT = 65_535;
const NO_MATCH_EXIT_CODE = 1;

export interface RunningProcess {
  pid: number;
  user: string;
  cpuPercent: number;
  memoryKb: number;
  command: string;
}

export interface RunningItem extends RunningProcess {
  name: string;
  /** True for the main process of an installed app, which can be asked to quit politely. */
  isApp: boolean;
}

/** The port when the text asks for one, like "port 3000". Words after "port" stay a name search. */
export const toPort = (query: string): number | undefined => {
  const digits = PORT_QUERY.exec(query)?.[1];
  if (digits === undefined) {
    return undefined;
  }
  const port = Number(digits);
  return port >= 1 && port <= MAX_PORT ? port : undefined;
};

export const parseProcessList = (output: string): RunningProcess[] =>
  output.split("\n").flatMap((line) => {
    const match = PS_LINE.exec(line);
    if (match === null) {
      return [];
    }
    const [, pid = "", user = "", cpu = "", memory = "", command = ""] = match;
    return [
      {
        pid: Number(pid),
        user,
        // ps writes the decimal the locale's way, and some locales use a comma.
        cpuPercent: Number(cpu.replace(",", ".")),
        memoryKb: Number(memory),
        command,
      },
    ];
  });

// Matched by name, because macOS runs some apps from elsewhere: Safari's path is in a system volume.
const toInstalledAppName = (command: string, appNames: ReadonlySet<string>): string | undefined => {
  const name = APP_EXECUTABLE.exec(command)?.[1];
  return name !== undefined && appNames.has(name) ? name : undefined;
};

/** An app can start several programs from its own folder. The one named after it is the app. */
const findMainProcesses = (
  processes: readonly RunningProcess[],
  appNames: ReadonlySet<string>,
): Map<string, RunningProcess> => {
  const mainProcesses = new Map<string, RunningProcess>();
  for (const candidate of processes) {
    const appName = toInstalledAppName(candidate.command, appNames);
    if (appName === undefined) {
      continue;
    }
    const current = mainProcesses.get(appName);
    const isBetterMatch =
      current !== undefined &&
      basename(current.command) !== appName &&
      basename(candidate.command) === appName;
    if (current === undefined || isBetterMatch) {
      mainProcesses.set(appName, candidate);
    }
  }
  return mainProcesses;
};

/** Running apps by name, then every other process, busiest first. Redhot can't stop itself here. */
export const toRunningItems = (
  processes: readonly RunningProcess[],
  appNames: ReadonlySet<string>,
  ownPid: number,
): RunningItem[] => {
  const others = processes.filter(({ pid }) => pid !== ownPid);
  const mainProcesses = findMainProcesses(others, appNames);
  const appPids = new Set([...mainProcesses.values()].map(({ pid }) => pid));
  const apps = [...mainProcesses.entries()]
    .map(([name, main]) => ({ ...main, name, isApp: true }))
    .toSorted((first, second) => first.name.localeCompare(second.name));
  const rest = others
    .filter(({ pid }) => !appPids.has(pid))
    .map((other) => ({ ...other, name: basename(other.command), isApp: false }))
    .toSorted((first, second) => second.cpuPercent - first.cpuPercent);
  return [...apps, ...rest];
};

/** Stopping a process someone else owns, usually root, takes sudo. */
export const needsAdmin = ({ user }: RunningItem, ownUser = userInfo().username): boolean =>
  user !== ownUser;

const listAppNames = async (): Promise<Set<string>> =>
  new Set((await listApps()).map(({ name }) => name));

export const listRunningItems = async (): Promise<RunningItem[]> => {
  const [{ stdout }, appNames] = await Promise.all([
    runCommand("ps", ["-axo", PS_COLUMNS]),
    listAppNames(),
  ]);
  return toRunningItems(parseProcessList(stdout), appNames, process.pid);
};

const isNoMatch = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === NO_MATCH_EXIT_CODE;

// lsof and ps both exit with 1 when they find nothing, which is an answer rather than a failure.
// lsof does the same when only some of what it was asked about has gone, so keep what it printed.
export const runForMatches = async (file: string, args: readonly string[]): Promise<string> => {
  try {
    const { stdout } = await runCommand(file, args);
    return stdout;
  } catch (error) {
    if (isNoMatch(error)) {
      return error instanceof Error && "stdout" in error ? String(error.stdout) : "";
    }
    throw error;
  }
};

export const listProcessesById = async (pids: readonly string[]): Promise<RunningItem[]> => {
  const [processes, appNames] = await Promise.all([
    runForMatches("ps", ["-o", PS_COLUMNS, "-p", pids.join(",")]),
    listAppNames(),
  ]);
  return toRunningItems(parseProcessList(processes), appNames, process.pid);
};

/** What's listening on this port. Without sudo, lsof can't see what root is listening with. */
export const listPortListeners = async (port: number): Promise<RunningItem[]> => {
  const pids = await runForMatches(LSOF_PATH, ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  const pidList = pids.split("\n").filter((pid) => pid !== "");
  return pidList.length === 0 ? [] : listProcessesById(pidList);
};

export const logPortLookupFailure = (error: unknown): void => {
  writeLog("processes.port-lookup-failed", { error }, { level: "warn" });
};
