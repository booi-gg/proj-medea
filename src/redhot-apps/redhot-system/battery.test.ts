import assert from "node:assert/strict";
import { test } from "node:test";
import { toBatteryLine } from "./battery.ts";

const toStatus = (reading: string): string =>
  `Now drawing from 'Battery Power'\n -InternalBattery-0 (id=23134307)\t${reading} present: true\n`;

const NO_ADAPTER = "No adapter attached.\n";
const ADAPTER = " Wattage = 96W\n Current = 4300mA\n Voltage = 20000mV\n";
const REPORT = JSON.stringify({
  SPPowerDataType: [
    {
      _name: "spbattery_information",
      sppower_battery_health_info: {
        sppower_battery_cycle_count: 358,
        sppower_battery_health_maximum_capacity: "88%",
      },
    },
    { _name: "sppower_information" },
  ],
});
const HEALTH = "358 cycles · 88% max capacity";

test("on battery, it shows the charge, time left and health", () => {
  assert.equal(
    toBatteryLine(toStatus("61%; discharging; 7:11 remaining"), NO_ADAPTER, REPORT),
    `61% · 7h 11m left · ${HEALTH}`,
  );
});

test("under an hour leaves out the hours and the leading zero", () => {
  assert.equal(
    toBatteryLine(toStatus("9%; discharging; 0:07 remaining"), NO_ADAPTER, REPORT),
    `9% · 7m left · ${HEALTH}`,
  );
});

test("no estimate yet, in either way pmset says it", () => {
  for (const reading of ["61%; discharging; (no estimate)", "61%; discharging; 0:00 remaining"]) {
    assert.equal(
      toBatteryLine(toStatus(reading), NO_ADAPTER, REPORT),
      `61% · Estimating time left · ${HEALTH}`,
    );
  }
});

test("charging shows the charger's wattage and the time to full", () => {
  assert.equal(
    toBatteryLine(toStatus("80%; charging; 1:23 remaining"), ADAPTER, REPORT),
    `80% · Charging at 96W · 1h 23m to full · ${HEALTH}`,
  );
});

test("finishing a charge counts as charging", () => {
  assert.equal(
    toBatteryLine(toStatus("98%; finishing charge; 0:10 remaining"), ADAPTER, REPORT),
    `98% · Charging at 96W · 10m to full · ${HEALTH}`,
  );
});

test("charging without a known wattage or estimate still reads well", () => {
  assert.equal(
    toBatteryLine(toStatus("80%; charging; (no estimate)"), "", REPORT),
    `80% · Charging · ${HEALTH}`,
  );
});

test("fully charged", () => {
  assert.equal(
    toBatteryLine(toStatus("100%; charged; 0:00 remaining"), ADAPTER, REPORT),
    `100% · Fully charged · ${HEALTH}`,
  );
});

test("plugged in while macOS holds the charge", () => {
  assert.equal(
    toBatteryLine(toStatus("80%; AC attached; not charging"), ADAPTER, REPORT),
    `80% · Plugged in, not charging · ${HEALTH}`,
  );
});

test("a missing or unreadable health report only leaves out the health", () => {
  const status = toStatus("61%; discharging; 7:11 remaining");
  for (const report of ["", "not json", "null", "{}", '{"SPPowerDataType":[{}]}']) {
    assert.equal(toBatteryLine(status, NO_ADAPTER, report), "61% · 7h 11m left", report);
  }
});

test("a battery on its first cycle says cycle", () => {
  const report = JSON.stringify({
    SPPowerDataType: [{ sppower_battery_health_info: { sppower_battery_cycle_count: 1 } }],
  });
  assert.equal(
    toBatteryLine(toStatus("61%; discharging; 7:11 remaining"), NO_ADAPTER, report),
    "61% · 7h 11m left · 1 cycle",
  );
});

test("a Mac with no battery says so", () => {
  assert.equal(
    toBatteryLine("Now drawing from 'AC Power'\n", ADAPTER, "{}"),
    "This Mac has no battery",
  );
});
