import { styleText } from "node:util";
import stringWidth from "string-width";
import { fitToWidth } from "../../launcher/split-view.ts";
import { toSafeName } from "../redhot-files/format.ts";
import { needsAdmin } from "./list.ts";
import type { RunningItem } from "./list.ts";
import type { PortListener } from "./ports.ts";

const KB_PER_MB = 1024;
const KB_PER_GB = 1024 * 1024;
const TAG_WIDTH = 8;
const PID_WIDTH = 6;
const CPU_WIDTH = 6;
const MEMORY_WIDTH = 8;
const COLUMN_GAP = "  ";
const DETAILS_WIDTH = TAG_WIDTH + PID_WIDTH + CPU_WIDTH + MEMORY_WIDTH + COLUMN_GAP.length * 4;
const MIN_NAME_WIDTH = 8;
const PORTS_WIDTH = 12;
const PORT_DETAILS_WIDTH = PORTS_WIDTH + PID_WIDTH + COLUMN_GAP.length * 2;

export const toMemoryLabel = (memoryKb: number): string =>
  memoryKb >= KB_PER_GB
    ? `${(memoryKb / KB_PER_GB).toFixed(1)} GB`
    : `${Math.round(memoryKb / KB_PER_MB)} MB`;

const toTag = (item: RunningItem, ownUser: string | undefined): string => {
  if (needsAdmin(item, ownUser)) {
    return toSafeName(item.user);
  }
  return item.isApp ? "App" : "Process";
};

/** The name, then its owner or kind, process ID, CPU and memory in dimmed columns. */
export const toRunningRow = (item: RunningItem, width: number, ownUser?: string): string => {
  const nameWidth = width - DETAILS_WIDTH;
  const safeName = toSafeName(item.name);
  if (nameWidth < MIN_NAME_WIDTH) {
    return fitToWidth(safeName, width);
  }
  const shownName = fitToWidth(safeName, nameWidth);
  const padding = " ".repeat(nameWidth - stringWidth(shownName));
  const details = [
    fitToWidth(toTag(item, ownUser), TAG_WIDTH).padEnd(TAG_WIDTH),
    String(item.pid).padStart(PID_WIDTH),
    `${item.cpuPercent.toFixed(1)}%`.padStart(CPU_WIDTH),
    toMemoryLabel(item.memoryKb).padStart(MEMORY_WIDTH),
  ].join(COLUMN_GAP);
  return `${shownName}${padding}${COLUMN_GAP}${styleText("gray", details)}`;
};

/** The ports first, since that's what's being looked for, then the name and a dimmed process ID. */
export const toPortRow = (listener: PortListener, width: number): string => {
  const ports = listener.ports.join(", ");
  const safeName = toSafeName(listener.name);
  const nameWidth = width - PORT_DETAILS_WIDTH;
  if (nameWidth < MIN_NAME_WIDTH) {
    return fitToWidth(`${ports}${COLUMN_GAP}${safeName}`, width);
  }
  const shownPorts = fitToWidth(ports, PORTS_WIDTH).padEnd(PORTS_WIDTH);
  const shownName = fitToWidth(safeName, nameWidth);
  const padding = " ".repeat(nameWidth - stringWidth(shownName));
  const pid = String(listener.pid).padStart(PID_WIDTH);
  return `${shownPorts}${COLUMN_GAP}${shownName}${padding}${COLUMN_GAP}${styleText("gray", pid)}`;
};
