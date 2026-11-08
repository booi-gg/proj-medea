const LOCALE = "en-US";
const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;
// Long enough to reach the next Feb 29, and it stops a date that never exists from looping.
const YEARS_TO_SEARCH = 8;

const COUNT_DAYS = /^days?\s+(until|till|to|since)\s+(.+)$/iu;
const DATE_ARITHMETIC = /^(.+?)\s*([+-])\s*(\d+)\s*(day|week|month|year)s?$/iu;
const FROM_DATE = /^(\d+)\s*(day|week|month|year)s?\s+(?:from|after)\s+(.+)$/iu;
const AGO = /^(\d+)\s*(day|week|month|year)s?\s+ago$/iu;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u;
const MONTH_FIRST = /^(\p{L}+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/iu;
const DAY_FIRST = /^(\d{1,2})(?:st|nd|rd|th)?\s+(\p{L}+)\.?(?:,?\s+(\d{4}))?$/iu;

const MONTHS: readonly string[] = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const SHORT_MONTH_LENGTH = 3;
const SEPTEMBER = 8;

type Direction = "next" | "previous";
type Period = "day" | "week" | "month" | "year";

/** Midnight UTC on a calendar day, which has no daylight saving to throw the sums off. */
type DayStamp = number;

export interface DateAnswer {
  name: string;
  answer: string;
}

const toToday = (now: Date): DayStamp => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

/** Undefined for a day the month doesn't have, like Feb 30. */
const toStamp = (year: number, month: number, day: number): DayStamp | undefined => {
  const stamp = Date.UTC(year, month, day);
  return new Date(stamp).getUTCMonth() === month && new Date(stamp).getUTCDate() === day
    ? stamp
    : undefined;
};

const findMonth = (text: string): number | undefined => {
  const name = text.toLowerCase();
  if (name.length < SHORT_MONTH_LENGTH) {
    return undefined;
  }
  if (name === "sept") {
    return SEPTEMBER;
  }
  const index = MONTHS.findIndex(
    (month) => month === name || (name.length === SHORT_MONTH_LENGTH && month.startsWith(name)),
  );
  return index === -1 ? undefined : index;
};

/** With no year, it's the closest one in the direction asked for, counting today. */
const toClosestStamp = (
  month: number,
  day: number,
  today: DayStamp,
  direction: Direction,
): DayStamp | undefined => {
  const thisYear = new Date(today).getUTCFullYear();
  const step = direction === "next" ? 1 : -1;
  for (let offset = 0; offset <= YEARS_TO_SEARCH; offset += 1) {
    const stamp = toStamp(thisYear + offset * step, month, day);
    const isOnRightSide =
      stamp !== undefined && (direction === "next" ? stamp >= today : stamp <= today);
    if (isOnRightSide) {
      return stamp;
    }
  }
  return undefined;
};

const readMonthAndDay = (
  monthText: string | undefined,
  dayText: string | undefined,
  yearText: string | undefined,
  today: DayStamp,
  direction: Direction,
): DayStamp | undefined => {
  const month = monthText === undefined ? undefined : findMonth(monthText);
  if (month === undefined || dayText === undefined) {
    return undefined;
  }
  return yearText === undefined
    ? toClosestStamp(month, Number(dayText), today, direction)
    : toStamp(Number(yearText), month, Number(dayText));
};

const readDate = (rawText: string, today: DayStamp, direction: Direction): DayStamp | undefined => {
  const text = rawText.trim().toLowerCase();
  if (text === "today" || text === "now") {
    return today;
  }
  if (text === "tomorrow") {
    return today + MS_PER_DAY;
  }
  if (text === "yesterday") {
    return today - MS_PER_DAY;
  }
  const iso = ISO_DATE.exec(text);
  if (iso !== null) {
    return toStamp(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const monthFirst = MONTH_FIRST.exec(text);
  if (monthFirst !== null) {
    return readMonthAndDay(monthFirst[1], monthFirst[2], monthFirst[3], today, direction);
  }
  const dayFirst = DAY_FIRST.exec(text);
  return dayFirst === null
    ? undefined
    : readMonthAndDay(dayFirst[2], dayFirst[1], dayFirst[3], today, direction);
};

/** Jan 31 plus a month is the end of February, not a date in March. */
const addMonths = (stamp: DayStamp, months: number): DayStamp => {
  const start = new Date(stamp);
  const firstOfTarget = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const year = firstOfTarget.getUTCFullYear();
  const month = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay));
};

const addPeriod = (stamp: DayStamp, count: number, period: Period): DayStamp => {
  switch (period) {
    case "day":
      return stamp + count * MS_PER_DAY;
    case "week":
      return stamp + count * DAYS_PER_WEEK * MS_PER_DAY;
    case "month":
      return addMonths(stamp, count);
    default:
      return addMonths(stamp, count * MONTHS_PER_YEAR);
  }
};

const formatDate = (stamp: DayStamp): string =>
  new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(stamp);

const toDayCount = (count: number): string =>
  `${new Intl.NumberFormat(LOCALE).format(count)} ${count === 1 ? "day" : "days"}`;

const describeCount = (text: string, today: DayStamp): DateAnswer | undefined => {
  const [, word, dateText] = COUNT_DAYS.exec(text) ?? [];
  if (word === undefined || dateText === undefined) {
    return undefined;
  }
  const isSince = word.toLowerCase() === "since";
  const stamp = readDate(dateText, today, isSince ? "previous" : "next");
  if (stamp === undefined) {
    return undefined;
  }
  const days = (stamp - today) / MS_PER_DAY;
  const count = Math.abs(days);
  const date = formatDate(stamp);
  const name =
    days > 0 ? `${toDayCount(count)} until ${date}` : `${toDayCount(count)} since ${date}`;
  return { name, answer: String(count) };
};

const toDateAnswer = (text: string, stamp: DayStamp): DateAnswer => {
  const answer = formatDate(stamp);
  return { name: `${text} = ${answer}`, answer };
};

const describeArithmetic = (text: string, today: DayStamp): DateAnswer | undefined => {
  const [, dateText, sign, countText, period] = DATE_ARITHMETIC.exec(text) ?? [];
  if (dateText === undefined || countText === undefined || period === undefined) {
    return undefined;
  }
  const start = readDate(dateText, today, "next");
  if (start === undefined) {
    return undefined;
  }
  const count = sign === "-" ? -Number(countText) : Number(countText);
  return toDateAnswer(text, addPeriod(start, count, period.toLowerCase() as Period));
};

const describeFromDate = (text: string, today: DayStamp): DateAnswer | undefined => {
  const [, countText, period, dateText] = FROM_DATE.exec(text) ?? [];
  if (countText === undefined || period === undefined || dateText === undefined) {
    return undefined;
  }
  const start = readDate(dateText, today, "next");
  return start === undefined
    ? undefined
    : toDateAnswer(text, addPeriod(start, Number(countText), period.toLowerCase() as Period));
};

const describeAgo = (text: string, today: DayStamp): DateAnswer | undefined => {
  const [, countText, period] = AGO.exec(text) ?? [];
  return countText === undefined || period === undefined
    ? undefined
    : toDateAnswer(text, addPeriod(today, -Number(countText), period.toLowerCase() as Period));
};

/** Undefined unless the text is one of the date phrases Redhot understands. */
export const answerDate = (text: string, now = new Date()): DateAnswer | undefined => {
  const trimmed = text.trim();
  const today = toToday(now);
  return (
    describeCount(trimmed, today) ??
    describeArithmetic(trimmed, today) ??
    describeFromDate(trimmed, today) ??
    describeAgo(trimmed, today)
  );
};
