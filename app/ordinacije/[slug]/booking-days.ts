import {
  addCalendarDays,
  formatBelgrade,
  localTimeOnDate,
  parseIsoDate,
} from "@/lib/calendar-dates";

export function buildBookingDayRange(todayIso: string, maxAheadDays: number): string[] {
  if (maxAheadDays < 0) {
    return [];
  }
  parseIsoDate(todayIso);
  const days: string[] = [];
  for (let offset = 0; offset <= maxAheadDays; offset += 1) {
    days.push(addCalendarDays(todayIso, offset));
  }
  return days;
}

export function formatBookingDayLabel(isoDate: string, todayIso: string): string {
  parseIsoDate(isoDate);
  if (isoDate === todayIso) {
    return "Danas";
  }
  return formatBelgrade(localTimeOnDate(isoDate, "12:00"), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
