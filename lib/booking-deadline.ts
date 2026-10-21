import {
  TWENTY_FOUR_HOURS_MS,
  formatBelgradeDate,
  isoDayOfWeek,
  localTimeOnDate,
  startOfNextBelgradeDay,
} from "@/lib/calendar-dates";

export type WeeklyHours = {
  isoDow: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export type BlockedPeriod = {
  startsAt: Date;
  endsAt: Date;
};

// Twenty-four elapsed hours are counted only on Belgrade days that are open
// for that dentist and are not covered by one block from opens_at through
// closes_at. The deadline never passes the appointment start.
export function bookingDeadline(input: {
  createdAt: Date;
  startsAt: Date;
  workingHours: readonly WeeklyHours[];
  blockedPeriods: readonly BlockedPeriod[];
}): Date {
  const limit = input.startsAt.getTime();
  if (limit <= input.createdAt.getTime()) {
    return new Date(limit);
  }

  let remaining = TWENTY_FOUR_HOURS_MS;
  let cursor = input.createdAt.getTime();

  for (let guard = 0; guard < 800 && remaining > 0; guard += 1) {
    if (cursor >= limit) {
      return new Date(limit);
    }
    const isoDate = formatBelgradeDate(new Date(cursor));
    const next = startOfNextBelgradeDay(isoDate).getTime();
    if (next <= cursor) {
      return new Date(limit);
    }
    if (!dayCounts(isoDate, input.workingHours, input.blockedPeriods)) {
      cursor = next;
      continue;
    }
    const room = Math.min(next, limit) - cursor;
    if (room >= remaining) {
      return new Date(cursor + remaining);
    }
    remaining -= room;
    cursor = next;
  }

  return new Date(limit);
}

function dayCounts(
  isoDate: string,
  workingHours: readonly WeeklyHours[],
  blockedPeriods: readonly BlockedPeriod[],
): boolean {
  const row = workingHours.find((hours) => hours.isoDow === isoDayOfWeek(isoDate));
  if (!row || row.isClosed || !row.opensAt || !row.closesAt) {
    return false;
  }
  const opens = localTimeOnDate(isoDate, row.opensAt);
  const closes = localTimeOnDate(isoDate, row.closesAt);
  if (closes.getTime() <= opens.getTime()) {
    return false;
  }
  return !blockedPeriods.some((block) => coversFullDay(block, opens, closes));
}

function coversFullDay(block: BlockedPeriod, opens: Date, closes: Date): boolean {
  return (
    block.startsAt.getTime() < block.endsAt.getTime() &&
    block.startsAt.getTime() <= opens.getTime() &&
    block.endsAt.getTime() >= closes.getTime()
  );
}
