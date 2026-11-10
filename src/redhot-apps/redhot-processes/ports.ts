import { homedir } from "node:os";
import { basename } from "node:path";
import { LSOF_PATH } from "../../shell.ts";
import { listProcessesById, runForMatches } from "./list.ts";
import type { RunningItem } from "./list.ts";

const PROCESS_FIELD = "p";
const NAME_FIELD = "n";
// The last colon, because an IPv6 address like [::1]:5173 has others before it.
const ADDRESS_PORT = /:(\d+)$/u;
const ROOT_FOLDER = "/";

export interface PortListener extends RunningItem {
  /** Lowest first. Stopping the process frees all of them, so they share one row. */
  ports: readonly number[];
}

/** Reads the output of `lsof -F pn`, where each field has a line of its own. */
export const parseLsofNames = (output: string): Map<number, string[]> => {
  const namesByPid = new Map<number, string[]>();
  let names: string[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith(PROCESS_FIELD)) {
      names = [];
      namesByPid.set(Number(line.slice(PROCESS_FIELD.length)), names);
    } else if (line.startsWith(NAME_FIELD)) {
      names.push(line.slice(NAME_FIELD.length));
    }
  }
  return namesByPid;
};

/** A server on both IPv4 and IPv6 is listed twice by lsof, but it's one port. */
export const toPorts = (addresses: readonly string[]): number[] => {
  const ports = addresses.flatMap((address) => {
    const digits = ADDRESS_PORT.exec(address)?.[1];
    return digits === undefined ? [] : [Number(digits)];
  });
  return [...new Set(ports)].toSorted((first, second) => first - second);
};

/** The folder a server was started in, which tells apart several servers all called node. */
export const toProjectName = (folder: string | undefined, home: string): string | undefined =>
  folder === undefined || folder === ROOT_FOLDER || folder === home ? undefined : basename(folder);

const toLowestPort = ({ ports }: PortListener): number => ports[0] ?? 0;

/** One row for each process that's listening, lowest port first. */
export const toPortListeners = (
  items: readonly RunningItem[],
  portsByPid: ReadonlyMap<number, readonly number[]>,
  foldersByPid: ReadonlyMap<number, readonly string[]>,
  home: string,
): PortListener[] =>
  items
    .flatMap((item) => {
      const ports = portsByPid.get(item.pid) ?? [];
      if (ports.length === 0) {
        return [];
      }
      const project = toProjectName(foldersByPid.get(item.pid)?.[0], home);
      // An app is asked to quit by its name, so that has to stay exactly as it is.
      const name = project === undefined || item.isApp ? item.name : `${project} (${item.name})`;
      return [{ ...item, name, ports }];
    })
    .toSorted((first, second) => toLowestPort(first) - toLowestPort(second));

/** Everything listening on a TCP port. Without sudo, lsof can't see what root is listening with. */
export const listPortsInUse = async (): Promise<PortListener[]> => {
  const addresses = await runForMatches(LSOF_PATH, ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"]);
  const portsByPid = new Map(
    [...parseLsofNames(addresses)].map(([pid, names]) => [pid, toPorts(names)] as const),
  );
  const pids = [...portsByPid.keys()].map(String);
  if (pids.length === 0) {
    return [];
  }
  const [items, folders] = await Promise.all([
    listProcessesById(pids),
    runForMatches(LSOF_PATH, ["-a", "-d", "cwd", "-p", pids.join(","), "-F", "pn"]),
  ]);
  return toPortListeners(items, portsByPid, parseLsofNames(folders), homedir());
};

export const listListenersOnPort = async (port: number): Promise<PortListener[]> =>
  (await listPortsInUse()).filter(({ ports }) => ports.includes(port));
