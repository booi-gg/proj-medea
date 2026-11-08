const SEPARATOR = " · ";
const NO_BATTERY_MESSAGE = "This Mac has no battery";
// " -InternalBattery-0 (id=23134307)	61%; discharging; 7:11 remaining present: true"
const BATTERY_LINE = /InternalBattery-\d+[^\n]*?(\d+)%;\s*([^;\n]+);\s*([^\n]*)/u;
const TIME_LEFT = /(\d+):(\d{2}) remaining/u;
const WATTAGE = /Wattage\s*=\s*(\d+)W/u;
const DISCHARGING = "discharging";
const CHARGED = "charged";
const CHARGING_STATES: ReadonlySet<string> = new Set(["charging", "finishing charge"]);

interface BatteryHealth {
  sppower_battery_cycle_count?: number;
  sppower_battery_health_maximum_capacity?: string;
}

interface PowerReport {
  SPPowerDataType?: { sppower_battery_health_info?: BatteryHealth }[];
}

/** pmset says "0:00 remaining" while it's still working out an estimate, so that's no time at all. */
const toTimeLeft = (details: string): string | undefined => {
  const [, hours = "0", minutes = "00"] = TIME_LEFT.exec(details) ?? [];
  if (hours === "0" && minutes === "00") {
    return undefined;
  }
  return hours === "0" ? `${Number(minutes)}m` : `${hours}h ${Number(minutes)}m`;
};

const toChargeParts = (state: string, details: string, adapter: string): string[] => {
  const timeLeft = toTimeLeft(details);
  if (state === DISCHARGING) {
    return [timeLeft === undefined ? "Estimating time left" : `${timeLeft} left`];
  }
  if (state === CHARGED) {
    return ["Fully charged"];
  }
  if (CHARGING_STATES.has(state)) {
    const watts = WATTAGE.exec(adapter)?.[1];
    return [
      watts === undefined ? "Charging" : `Charging at ${watts}W`,
      ...(timeLeft === undefined ? [] : [`${timeLeft} to full`]),
    ];
  }
  // macOS holds the charge at a limit to protect the battery, and reports it as "AC attached".
  return ["Plugged in, not charging"];
};

/** Health is a nice extra, so a report that's missing or unreadable only leaves it out. */
const toHealthParts = (report: string): string[] => {
  let health: BatteryHealth | undefined;
  try {
    const { SPPowerDataType: entries = [] } = JSON.parse(report) as PowerReport;
    health = entries.find(
      (entry) => entry.sppower_battery_health_info !== undefined,
    )?.sppower_battery_health_info;
  } catch {
    return [];
  }
  const cycles = health?.sppower_battery_cycle_count;
  const capacity = health?.sppower_battery_health_maximum_capacity;
  return [
    ...(cycles === undefined ? [] : [`${cycles} ${cycles === 1 ? "cycle" : "cycles"}`]),
    ...(capacity === undefined ? [] : [`${capacity} max capacity`]),
  ];
};

/** Takes the output of `pmset -g batt`, `pmset -g ac` and `system_profiler -json SPPowerDataType`. */
export const toBatteryLine = (status: string, adapter: string, report: string): string => {
  const match = BATTERY_LINE.exec(status);
  if (match === null) {
    return NO_BATTERY_MESSAGE;
  }
  const [, percent, state = "", details = ""] = match;
  return [
    `${percent}%`,
    ...toChargeParts(state.trim(), details, adapter),
    ...toHealthParts(report),
  ].join(SEPARATOR);
};
