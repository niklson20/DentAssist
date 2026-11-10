import { BELGRADE_TIME_ZONE } from "@/lib/calendar-dates";

import type { ClinicHoursRange } from "./load-clinic-public";

export type ClinicHoursStatus = "open" | "closed" | "unknown";

export function getClinicHoursStatus(input: {
  now: Date;
  weekdayHours: ClinicHoursRange | null;
  weekendHours: ClinicHoursRange | null;
  weekdayHasSchedule: boolean;
  weekendHasSchedule: boolean;
}): ClinicHoursStatus {
  if (!Number.isFinite(input.now.getTime())) {
    return "unknown";
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(input.now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const day = values.weekday;
  const isWeekend = day === "Sat" || day === "Sun";
  const hours = isWeekend ? input.weekendHours : input.weekdayHours;
  const hasSchedule = isWeekend ? input.weekendHasSchedule : input.weekdayHasSchedule;

  if (!hours) {
    return hasSchedule ? "closed" : "unknown";
  }

  const opensAt = parseMinutes(hours.opensAt);
  const closesAt = parseMinutes(hours.closesAt);
  const currentMinutes = Number(values.hour) * 60 + Number(values.minute);
  if (opensAt === null || closesAt === null || !Number.isFinite(currentMinutes)) {
    return "unknown";
  }

  const isOpen =
    opensAt < closesAt
      ? currentMinutes >= opensAt && currentMinutes < closesAt
      : opensAt > closesAt && (currentMinutes >= opensAt || currentMinutes < closesAt);
  return isOpen ? "open" : "closed";
}

function parseMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
