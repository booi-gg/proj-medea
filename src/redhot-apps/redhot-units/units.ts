const CONVERSION = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(.+?)\s+(?:to|in)\s+(.+)$/iu;
const FAHRENHEIT_OFFSET = 32;
const FAHRENHEIT_SCALE = 1.8;
const KELVIN_OFFSET = 273.15;
const WHOLE_NUMBER_DIGITS = 4;
const SMALL_NUMBER_DIGITS = 4;
const LOCALE = "en-US";

type Group = "length" | "mass" | "volume" | "area" | "speed" | "time" | "data" | "temperature";

interface Unit {
  group: Group;
  label: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

/** The label first, then each size in the group's base unit, then every other way to write it. */
type UnitRow = readonly [label: string, size: number, ...names: string[]];

const LENGTH: readonly UnitRow[] = [
  ["mm", 0.001, "millimetre", "millimetres", "millimeter", "millimeters"],
  ["cm", 0.01, "centimetre", "centimetres", "centimeter", "centimeters"],
  ["m", 1, "metre", "metres", "meter", "meters"],
  ["km", 1000, "kms", "kilometre", "kilometres", "kilometer", "kilometers"],
  ["in", 0.0254, "inch", "inches"],
  ["ft", 0.3048, "foot", "feet"],
  ["yd", 0.9144, "yard", "yards", "yds"],
  ["mi", 1609.344, "mile", "miles"],
  ["nmi", 1852, "nautical mile", "nautical miles"],
];

const MASS: readonly UnitRow[] = [
  ["mg", 0.001, "milligram", "milligrams"],
  ["g", 1, "gram", "grams"],
  ["kg", 1000, "kilo", "kilos", "kilogram", "kilograms"],
  ["t", 1_000_000, "tonne", "tonnes"],
  ["oz", 28.349_523_125, "ounce", "ounces"],
  ["lb", 453.592_37, "lbs", "pound", "pounds"],
  ["st", 6350.293_18, "stone", "stones"],
];

// US kitchen sizes, which is what recipes online mostly mean.
const VOLUME: readonly UnitRow[] = [
  ["ml", 1, "millilitre", "millilitres", "milliliter", "milliliters"],
  ["l", 1000, "litre", "litres", "liter", "liters"],
  ["tsp", 4.928_921_593_75, "teaspoon", "teaspoons"],
  ["tbsp", 14.786_764_781_25, "tablespoon", "tablespoons"],
  ["fl oz", 29.573_529_562_5, "floz", "fluid ounce", "fluid ounces"],
  ["cup", 236.588_236_5, "cups"],
  ["pt", 473.176_473, "pint", "pints"],
  ["qt", 946.352_946, "quart", "quarts"],
  ["gal", 3785.411_784, "gallon", "gallons"],
];

const AREA: readonly UnitRow[] = [
  ["m²", 1, "m2", "sq m", "sqm", "square metre", "square metres", "square meter", "square meters"],
  ["km²", 1_000_000, "km2", "sq km", "sqkm", "square kilometre", "square kilometres"],
  ["ft²", 0.092_903_04, "ft2", "sq ft", "sqft", "square foot", "square feet"],
  ["yd²", 0.836_127_36, "yd2", "sq yd", "square yard", "square yards"],
  ["mi²", 2_589_988.110_336, "mi2", "sq mi", "square mile", "square miles"],
  ["acre", 4046.856_422_4, "acres"],
  ["ha", 10_000, "hectare", "hectares"],
];

const SPEED: readonly UnitRow[] = [
  ["m/s", 1, "mps"],
  ["km/h", 1 / 3.6, "kph", "kmh", "kmph"],
  ["mph", 0.447_04, "mi/h"],
  ["kn", 1852 / 3600, "knot", "knots"],
];

const TIME: readonly UnitRow[] = [
  ["ms", 0.001, "millisecond", "milliseconds"],
  ["s", 1, "sec", "secs", "second", "seconds"],
  ["min", 60, "mins", "minute", "minutes"],
  ["h", 3600, "hr", "hrs", "hour", "hours"],
  ["d", 86_400, "day", "days"],
  ["wk", 604_800, "week", "weeks"],
];

// Decimal for KB and GB, as Finder counts them. KiB and GiB are there for the binary sizes.
const DATA: readonly UnitRow[] = [
  ["B", 1, "b", "byte", "bytes"],
  ["KB", 1e3, "kb", "kilobyte", "kilobytes"],
  ["MB", 1e6, "mb", "megabyte", "megabytes"],
  ["GB", 1e9, "gb", "gigabyte", "gigabytes"],
  ["TB", 1e12, "tb", "terabyte", "terabytes"],
  ["PB", 1e15, "pb", "petabyte", "petabytes"],
  ["KiB", 2 ** 10, "kib"],
  ["MiB", 2 ** 20, "mib"],
  ["GiB", 2 ** 30, "gib"],
  ["TiB", 2 ** 40, "tib"],
  ["bit", 1 / 8, "bits"],
  ["kbit", 1e3 / 8, "kilobit", "kilobits"],
  ["Mbit", 1e6 / 8, "mbit", "megabit", "megabits"],
  ["Gbit", 1e9 / 8, "gbit", "gigabit", "gigabits"],
];

// Checked before anything is lowercased, because Mb and MB are different sizes.
const CASE_SENSITIVE_NAMES: Readonly<Record<string, string>> = {
  Kb: "kbit",
  Mb: "mbit",
  Gb: "gbit",
};

const TEMPERATURES: readonly (Unit & { names: readonly string[] })[] = [
  {
    group: "temperature",
    label: "°C",
    names: ["c", "°c", "celsius", "centigrade"],
    toBase: (value) => value,
    fromBase: (value) => value,
  },
  {
    group: "temperature",
    label: "°F",
    names: ["f", "°f", "fahrenheit"],
    toBase: (value) => (value - FAHRENHEIT_OFFSET) / FAHRENHEIT_SCALE,
    fromBase: (value) => value * FAHRENHEIT_SCALE + FAHRENHEIT_OFFSET,
  },
  {
    group: "temperature",
    label: "K",
    names: ["k", "kelvin"],
    toBase: (value) => value - KELVIN_OFFSET,
    fromBase: (value) => value + KELVIN_OFFSET,
  },
];

const GROUPS: readonly (readonly [Group, readonly UnitRow[]])[] = [
  ["length", LENGTH],
  ["mass", MASS],
  ["volume", VOLUME],
  ["area", AREA],
  ["speed", SPEED],
  ["time", TIME],
  ["data", DATA],
];

const toUnitEntries = (group: Group, rows: readonly UnitRow[]): (readonly [string, Unit])[] =>
  rows.flatMap(([label, size, ...names]) => {
    const unit: Unit = {
      group,
      label,
      toBase: (value) => value * size,
      fromBase: (value) => value / size,
    };
    return [label.toLowerCase(), ...names].map((name) => [name, unit] as const);
  });

const UNITS: ReadonlyMap<string, Unit> = new Map([
  ...GROUPS.flatMap(([group, rows]) => toUnitEntries(group, rows)),
  ...TEMPERATURES.flatMap((unit) => unit.names.map((name) => [name, unit] as const)),
]);

const findUnit = (text: string): Unit | undefined =>
  UNITS.get(CASE_SENSITIVE_NAMES[text] ?? text.toLowerCase());

const toNumberFormat = (value: number, useGrouping: boolean): Intl.NumberFormat =>
  new Intl.NumberFormat(LOCALE, {
    useGrouping,
    // A tiny answer would otherwise round away to nothing.
    ...(Math.abs(value) >= 1 || value === 0
      ? { maximumFractionDigits: WHOLE_NUMBER_DIGITS }
      : { maximumSignificantDigits: SMALL_NUMBER_DIGITS }),
  });

export interface UnitConversion {
  /** Shown on the row, like "5 km = 3.1069 mi". */
  name: string;
  /** Only the number, so it can be pasted into a calculation. */
  answer: string;
}

/** Undefined unless both units are known and measure the same kind of thing. */
export const convertUnits = (text: string): UnitConversion | undefined => {
  const [, amountText, sourceText, targetText] = CONVERSION.exec(text.trim()) ?? [];
  if (amountText === undefined || sourceText === undefined || targetText === undefined) {
    return undefined;
  }
  const source = findUnit(sourceText);
  const target = findUnit(targetText);
  if (source === undefined || target === undefined || source.group !== target.group) {
    return undefined;
  }
  const amount = Number(amountText);
  const converted = target.fromBase(source.toBase(amount));
  const shownAmount = toNumberFormat(amount, true).format(amount);
  const shownResult = toNumberFormat(converted, true).format(converted);
  return {
    name: `${shownAmount} ${source.label} = ${shownResult} ${target.label}`,
    answer: toNumberFormat(converted, false).format(converted),
  };
};
