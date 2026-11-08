const LOCALE = "en-US";
const WHOLE_QUERY = /^(.+?)\s+(?:in|to)\s+(.+)$/iu;
const CURRENT_TIME = /^(?:time|now)\s+in\s+(.+)$/iu;
const TWELVE_HOUR = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b\s*(.*)$/iu;
const TWENTY_FOUR_HOUR = /^(\d{1,2}):(\d{2})\b\s*(.*)$/u;
const NAMED_TIME = /^(noon|midnight)\b\s*(.*)$/iu;
const WORD_START = /\b\p{L}/gu;
// macOS's time format puts this narrow space before AM and PM, which pastes badly.
const NARROW_SPACE = / /gu;
const HOURS_IN_HALF_DAY = 12;
const LAST_HOUR = 23;
const LAST_MINUTE = 59;
const NOON_HOUR = 12;

// PST and friends mean the place, so they follow its daylight saving, as people use them.
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  utc: "UTC",
  gmt: "UTC",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  mst: "America/Denver",
  mdt: "America/Denver",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  est: "America/New_York",
  edt: "America/New_York",
  et: "America/New_York",
  bst: "Europe/London",
  cet: "Europe/Paris",
  cest: "Europe/Paris",
  ist: "Asia/Kolkata",
  jst: "Asia/Tokyo",
  kst: "Asia/Seoul",
  sgt: "Asia/Singapore",
  hkt: "Asia/Hong_Kong",
  aest: "Australia/Sydney",
  aedt: "Australia/Sydney",
  nzst: "Pacific/Auckland",
  nzdt: "Pacific/Auckland",
};

const CITIES: Readonly<Record<string, string>> = {
  "abu dhabi": "Asia/Dubai",
  amsterdam: "Europe/Amsterdam",
  anchorage: "America/Anchorage",
  athens: "Europe/Athens",
  atlanta: "America/New_York",
  auckland: "Pacific/Auckland",
  austin: "America/Chicago",
  bangalore: "Asia/Kolkata",
  bengaluru: "Asia/Kolkata",
  bangkok: "Asia/Bangkok",
  barcelona: "Europe/Madrid",
  beijing: "Asia/Shanghai",
  berlin: "Europe/Berlin",
  boston: "America/New_York",
  brussels: "Europe/Brussels",
  "buenos aires": "America/Argentina/Buenos_Aires",
  cairo: "Africa/Cairo",
  "cape town": "Africa/Johannesburg",
  chennai: "Asia/Kolkata",
  chicago: "America/Chicago",
  copenhagen: "Europe/Copenhagen",
  dallas: "America/Chicago",
  delhi: "Asia/Kolkata",
  denver: "America/Denver",
  dhaka: "Asia/Dhaka",
  dubai: "Asia/Dubai",
  dublin: "Europe/Dublin",
  frankfurt: "Europe/Berlin",
  geneva: "Europe/Zurich",
  helsinki: "Europe/Helsinki",
  "hong kong": "Asia/Hong_Kong",
  honolulu: "Pacific/Honolulu",
  houston: "America/Chicago",
  hyderabad: "Asia/Kolkata",
  istanbul: "Europe/Istanbul",
  jakarta: "Asia/Jakarta",
  johannesburg: "Africa/Johannesburg",
  karachi: "Asia/Karachi",
  kathmandu: "Asia/Kathmandu",
  kolkata: "Asia/Kolkata",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  lagos: "Africa/Lagos",
  lisbon: "Europe/Lisbon",
  london: "Europe/London",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  madrid: "Europe/Madrid",
  manila: "Asia/Manila",
  melbourne: "Australia/Melbourne",
  "mexico city": "America/Mexico_City",
  miami: "America/New_York",
  milan: "Europe/Rome",
  montreal: "America/Toronto",
  moscow: "Europe/Moscow",
  mumbai: "Asia/Kolkata",
  munich: "Europe/Berlin",
  nairobi: "Africa/Nairobi",
  "new delhi": "Asia/Kolkata",
  "new york": "America/New_York",
  nyc: "America/New_York",
  oslo: "Europe/Oslo",
  paris: "Europe/Paris",
  perth: "Australia/Perth",
  phoenix: "America/Phoenix",
  prague: "Europe/Prague",
  pune: "Asia/Kolkata",
  rome: "Europe/Rome",
  "san francisco": "America/Los_Angeles",
  sf: "America/Los_Angeles",
  santiago: "America/Santiago",
  "sao paulo": "America/Sao_Paulo",
  seattle: "America/Los_Angeles",
  seoul: "Asia/Seoul",
  shanghai: "Asia/Shanghai",
  shillong: "Asia/Kolkata",
  singapore: "Asia/Singapore",
  stockholm: "Europe/Stockholm",
  sydney: "Australia/Sydney",
  taipei: "Asia/Taipei",
  "tel aviv": "Asia/Jerusalem",
  tokyo: "Asia/Tokyo",
  toronto: "America/Toronto",
  vancouver: "America/Vancouver",
  vienna: "Europe/Vienna",
  warsaw: "Europe/Warsaw",
  washington: "America/New_York",
  zurich: "Europe/Zurich",
};

interface Place {
  zone: string;
  label: string;
}

interface Clock {
  hour: number;
  minute: number;
  rest: string;
}

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface TimeAnswer {
  name: string;
  answer: string;
}

const toTitleCase = (text: string): string =>
  text.replace(WORD_START, (letter) => letter.toUpperCase());

const findPlace = (text: string): Place | undefined => {
  const key = text.trim().toLowerCase();
  const abbreviated = Object.hasOwn(ABBREVIATIONS, key) ? ABBREVIATIONS[key] : undefined;
  if (abbreviated !== undefined) {
    return { zone: abbreviated, label: key.toUpperCase() };
  }
  const city = Object.hasOwn(CITIES, key) ? CITIES[key] : undefined;
  return city === undefined ? undefined : { zone: city, label: toTitleCase(key) };
};

const toTwentyFourHour = (hour: number, period: string): number =>
  (hour % HOURS_IN_HALF_DAY) + (period.toLowerCase() === "pm" ? HOURS_IN_HALF_DAY : 0);

const readTwelveHour = (text: string): Clock | undefined => {
  const [, hourText, minuteText = "0", period, rest = ""] = TWELVE_HOUR.exec(text) ?? [];
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (period === undefined || hour < 1 || hour > HOURS_IN_HALF_DAY || minute > LAST_MINUTE) {
    return undefined;
  }
  return { hour: toTwentyFourHour(hour, period), minute, rest };
};

const readTwentyFourHour = (text: string): Clock | undefined => {
  const [, hourText, minuteText, rest = ""] = TWENTY_FOUR_HOUR.exec(text) ?? [];
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hourText === undefined || hour > LAST_HOUR || minute > LAST_MINUTE) {
    return undefined;
  }
  return { hour, minute, rest };
};

const readNamedTime = (text: string): Clock | undefined => {
  const [, name, rest = ""] = NAMED_TIME.exec(text) ?? [];
  if (name === undefined) {
    return undefined;
  }
  return { hour: name.toLowerCase() === "noon" ? NOON_HOUR : 0, minute: 0, rest };
};

const readClock = (text: string): Clock | undefined =>
  readTwelveHour(text) ?? readTwentyFourHour(text) ?? readNamedTime(text);

const readWallTime = (instant: number, zone: string): WallTime => {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
};

const toUtcStamp = ({ year, month, day, hour, minute, second }: WallTime): number =>
  Date.UTC(year, month - 1, day, hour, minute, second);

/** How far this zone's clocks are ahead of UTC at that moment. */
const toOffset = (instant: number, zone: string): number =>
  toUtcStamp(readWallTime(instant, zone)) - Math.floor(instant / 1000) * 1000;

/** The moment a clock in that zone shows this. Twice, in case the guess crossed a clock change. */
const toInstant = (wall: WallTime, zone: string): number => {
  const stamp = toUtcStamp(wall);
  const firstGuess = stamp - toOffset(stamp, zone);
  return stamp - toOffset(firstGuess, zone);
};

const formatTime = (instant: number, zone: string): string =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: zone, timeStyle: "short" })
    .format(instant)
    .replaceAll(NARROW_SPACE, " ");

const formatDay = (instant: number, zone: string): string =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(instant);

const describeCurrentTime = (text: string, now: Date): TimeAnswer | undefined => {
  const [, placeText] = CURRENT_TIME.exec(text) ?? [];
  const place = placeText === undefined ? undefined : findPlace(placeText);
  if (place === undefined) {
    return undefined;
  }
  const time = formatTime(now.getTime(), place.zone);
  return { name: `${place.label}: ${time}, ${formatDay(now.getTime(), place.zone)}`, answer: time };
};

const describeConversion = (text: string, now: Date, localZone: string): TimeAnswer | undefined => {
  const [, sourceText, targetText] = WHOLE_QUERY.exec(text) ?? [];
  const clock = sourceText === undefined ? undefined : readClock(sourceText);
  const target = targetText === undefined ? undefined : findPlace(targetText);
  if (clock === undefined || target === undefined) {
    return undefined;
  }
  const source = clock.rest === "" ? { zone: localZone, label: "" } : findPlace(clock.rest);
  if (source === undefined) {
    return undefined;
  }
  // "3pm PST" means 3pm on whatever day it is there now, not on the day it is here.
  const today = readWallTime(now.getTime(), source.zone);
  const instant = toInstant(
    { ...today, hour: clock.hour, minute: clock.minute, second: 0 },
    source.zone,
  );
  const sourceTime = [formatTime(instant, source.zone), source.label].join(" ").trim();
  const time = formatTime(instant, target.zone);
  const targetDay = formatDay(instant, target.zone);
  const dayNote = targetDay === formatDay(instant, source.zone) ? "" : `, ${targetDay}`;
  return { name: `${sourceTime} = ${time} ${target.label}${dayNote}`, answer: time };
};

/** Undefined unless the text names a time and places Redhot knows. */
export const answerTimeZone = (
  text: string,
  now = new Date(),
  localZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): TimeAnswer | undefined => {
  const trimmed = text.trim();
  return describeCurrentTime(trimmed, now) ?? describeConversion(trimmed, now, localZone);
};
