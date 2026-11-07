import {
  addCalendarDays,
  formatYmd,
  formatBelgrade,
  isoDayOfWeek,
  localTimeOnDate,
  parseIsoDate,
} from "@/lib/calendar-dates";

export const BOOKING_CALENDAR_WEEKDAYS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"] as const;

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

export function buildBookingCalendarWeeks(month: string): string[][] {
  const { year, month: monthNumber } = parseIsoDate(month);
  const firstDay = formatYmd({ year, month: monthNumber, day: 1 });
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leadingDays = isoDayOfWeek(firstDay) - 1;
  const cellCount = Math.ceil((leadingDays + daysInMonth) / 7) * 7;
  const firstCell = addCalendarDays(firstDay, -leadingDays);

  return Array.from({ length: cellCount / 7 }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) =>
      addCalendarDays(firstCell, week * 7 + weekday),
    ),
  );
}

export function formatBookingMonthLabel(month: string): string {
  const { year, month: monthNumber } = parseIsoDate(month);
  return formatBelgrade(localTimeOnDate(formatYmd({ year, month: monthNumber, day: 1 }), "12:00"), {
    month: "long",
    year: "numeric",
  });
}

export function formatBookingCalendarDayLabel(isoDate: string): string {
  parseIsoDate(isoDate);
  return formatBelgrade(localTimeOnDate(isoDate, "12:00"), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
