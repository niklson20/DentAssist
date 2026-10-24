import { isoDayOfWeek, parseIsoDate } from "@/lib/calendar-dates";

export const WEEKDAY_LONG = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota", "Nedelja"] as const;

export const WEEKDAY_SHORT = ["PON", "UTO", "SRE", "ČET", "PET", "SUB", "NED"] as const;

export function weekdayLabels(datum: string): { long: string; short: string } {
  const index = isoDayOfWeek(datum) - 1;
  return {
    long: WEEKDAY_LONG[index] ?? WEEKDAY_LONG[0],
    short: WEEKDAY_SHORT[index] ?? WEEKDAY_SHORT[0],
  };
}

export function shortDateLabel(datum: string): string {
  const { day, month } = parseIsoDate(datum);
  return `${day}. ${month}.`;
}
