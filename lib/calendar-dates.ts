export const BELGRADE_TIME_ZONE = "Europe/Belgrade";

export const BELGRADE_LOCALE = "sr-Latn-RS";

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_VIEWS = ["dan", "nedelja", "mesec"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export type CalendarQuery = {
  prikaz: CalendarView;
  datum: string;
  stomatolog: string | null;
  sakrijOtkazane: boolean;
};

export type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
};

export type CalendarParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

type Ymd = {
  year: number;
  month: number;
  day: number;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const BELGRADE_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function parseIsoDate(value: string): Ymd {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new RangeError(`Invalid date ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isRealUtcDate(year, month, day)) {
    throw new RangeError(`Invalid date ${value}`);
  }
  return { year, month, day };
}

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && isRealYmd(value);
}

export function formatYmd(parts: Ymd): string {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatYmd({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function addCalendarMonths(isoDate: string, months: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = shifted.getUTCFullYear();
  const targetMonth = shifted.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return formatYmd({ year: targetYear, month: targetMonth, day: Math.min(day, lastDay) });
}

export function isoDayOfWeek(isoDate: string): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  const { year, month, day } = parseIsoDate(isoDate);
  const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayBased === 0 ? 7 : sundayBased) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export function startOfBelgradeWeek(isoDate: string): string {
  return addCalendarDays(isoDate, 1 - isoDayOfWeek(isoDate));
}

export function parseClockSeconds(time: string): number {
  const match = CLOCK_TIME.exec(time);
  if (!match) {
    throw new RangeError(`Invalid time ${time}`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError(`Invalid time ${time}`);
  }
  return hour * 3600 + minute * 60 + second;
}

export function localTimeOnDate(isoDate: string, time: string): Date {
  const total = parseClockSeconds(time);
  return belgradeLocalToDate({
    ...parseIsoDate(isoDate),
    hour: Math.floor(total / 3600),
    minute: Math.floor((total % 3600) / 60),
    second: total % 60,
  });
}

export function belgradeLocalToDate(local: LocalDateTime): Date {
  const second = local.second ?? 0;
  if (
    local.hour > 23 ||
    local.minute > 59 ||
    second > 59 ||
    local.hour < 0 ||
    local.minute < 0 ||
    second < 0
  ) {
    throw new RangeError("Invalid time");
  }
  if (!isRealUtcDate(local.year, local.month, local.day)) {
    throw new RangeError("Invalid date");
  }
  return utcFromBelgradeWall(local.year, local.month, local.day, local.hour, local.minute, second);
}

export function belgradeLocalToISO(local: LocalDateTime): string {
  return belgradeLocalToDate(local).toISOString();
}

export function parseBelgradeLocal(value: string): Date {
  const match = BELGRADE_LOCAL.exec(value);
  if (!match) {
    throw new RangeError(`Invalid Belgrade local time ${value}`);
  }
  return belgradeLocalToDate({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  });
}

export function formatBelgradeDate(instant: Date): string {
  const parts = wallParts(instant);
  return formatYmd(parts);
}

export function formatBelgrade(
  instant: Date,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(BELGRADE_LOCALE, {
    ...options,
    timeZone: BELGRADE_TIME_ZONE,
  }).format(instant);
}

export function startOfBelgradeDay(isoDate: string): Date {
  return localTimeOnDate(isoDate, "00:00");
}

export function startOfNextBelgradeDay(isoDate: string): Date {
  return startOfBelgradeDay(addCalendarDays(isoDate, 1));
}

export function isVisitLocked(endsAt: Date, now: Date): boolean {
  return now.getTime() >= endsAt.getTime() + TWENTY_FOUR_HOURS_MS;
}

export function isDocumentLocked(createdAt: Date, now: Date): boolean {
  return now.getTime() >= createdAt.getTime() + TWENTY_FOUR_HOURS_MS;
}

// A 29 February birthday is kept on 1 March when the 15th year is not a leap year:
// that is the first date on which fifteen full years have elapsed.
export function fifteenthBirthday(dateOfBirth: string): string {
  const birth = parseIsoDate(dateOfBirth);
  const year = birth.year + 15;
  if (birth.month === 2 && birth.day === 29 && !isLeapYear(year)) {
    return formatYmd({ year, month: 3, day: 1 });
  }
  return formatYmd({ year, month: birth.month, day: birth.day });
}

export function hasTurned15(dateOfBirth: string, onDate: string): boolean {
  parseIsoDate(onDate);
  return onDate >= fifteenthBirthday(dateOfBirth);
}

export function needsPatientEmailTask(input: {
  hasContact: boolean;
  dateOfBirth: string | null;
  email: string | null;
  emailDeclined: boolean;
  onDate: string;
}): boolean {
  if (!input.hasContact || input.emailDeclined || input.dateOfBirth === null) {
    return false;
  }
  if (input.email !== null && input.email.trim() !== "") {
    return false;
  }
  return hasTurned15(input.dateOfBirth, input.onDate);
}

export function parseCalendarState(params: CalendarParams, today: string): CalendarQuery {
  const datumFallback = formatYmd(parseIsoDate(today));
  const prikaz = parseView(readParam(params, "prikaz"));
  const datumValue = readParam(params, "datum");
  const datum =
    datumValue !== undefined && isIsoDate(datumValue) ? formatYmd(parseIsoDate(datumValue)) : datumFallback;
  const stomatologValue = readParam(params, "stomatolog")?.trim();
  return {
    prikaz,
    datum,
    stomatolog: stomatologValue ? stomatologValue : null,
    sakrijOtkazane: parseHideCancelled(readParam(params, "sakrijOtkazane")),
  };
}

function parseView(value: string | undefined): CalendarView {
  if (value === "dan" || value === "nedelja" || value === "mesec") {
    return value;
  }
  return "dan";
}

function parseHideCancelled(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "ne";
}

function readParam(params: CalendarParams, key: string): string | undefined {
  if (params instanceof URLSearchParams) {
    const value = params.get(key);
    return value === null ? undefined : value;
  }
  const raw = params[key];
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

function isRealYmd(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  return isRealUtcDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function isRealUtcDate(year: number, month: number, day: number): boolean {
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

// The missing hour in March is stored one hour later. The repeated hour in
// October is the later occurrence, after the clock has fallen back to CET.
function utcFromBelgradeWall(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = timeZoneOffsetMs(new Date(desired));
  const firstUtc = desired - firstOffset;
  const secondOffset = timeZoneOffsetMs(new Date(firstUtc));
  return new Date(desired - secondOffset);
}

function timeZoneOffsetMs(instant: Date): number {
  const parts = wallParts(instant);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallAsUtc - instant.getTime();
}

function wallParts(instant: Date): Ymd & { hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const value: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      value[part.type] = part.value;
    }
  }
  let year = Number(value.year);
  let month = Number(value.month);
  let day = Number(value.day);
  let hour = Number(value.hour);
  if (hour === 24) {
    hour = 0;
    const rolled = new Date(Date.UTC(year, month - 1, day + 1));
    year = rolled.getUTCFullYear();
    month = rolled.getUTCMonth() + 1;
    day = rolled.getUTCDate();
  }
  return {
    year,
    month,
    day,
    hour,
    minute: Number(value.minute),
    second: Number(value.second),
  };
}
