import {
  addCalendarDays,
  formatBelgradeDate,
  formatYmd,
  localTimeOnDate,
  parseClockSeconds,
  parseIsoDate,
} from "@/lib/calendar-dates";
import { occupiesAppointmentSlot, type AppointmentStatus } from "@/lib/labels";

export const SLOT_MINUTES = [15, 30] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

export const BUFFER_MINUTES = [0, 5, 10, 15] as const;
export type BufferMinutes = (typeof BUFFER_MINUTES)[number];

export type ScheduledAppointment = {
  dentistId: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
};

export type WorkingInterval = {
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  breakStartsAt: string | null;
  breakEndsAt: string | null;
};

export type TimeRange = {
  startsAt: Date;
  endsAt: Date;
};

export type AvailableSlotsInput = {
  dentistId: string;
  now: Date;
  day: string;
  slotMinutes: SlotMinutes;
  bufferMinutes: BufferMinutes;
  durationMinutes: number;
  minNoticeMinutes: number;
  maxAheadDays: number;
  unavailable: boolean;
  workingDay: WorkingInterval | null;
  blockedPeriods: readonly TimeRange[];
  occupied: readonly ScheduledAppointment[];
};

// Buffer is not part of overlap. Staff may book without it; the public grid
// leaves one gap after the earlier appointment and snaps to the step.
export function appointmentsOverlap(left: ScheduledAppointment, right: ScheduledAppointment): boolean {
  if (left.dentistId !== right.dentistId) {
    return false;
  }
  if (!occupiesAppointmentSlot(left.status) || !occupiesAppointmentSlot(right.status)) {
    return false;
  }
  return left.startsAt.getTime() < right.endsAt.getTime() && right.startsAt.getTime() < left.endsAt.getTime();
}

export function availableSlotStarts(input: AvailableSlotsInput): Date[] {
  const day = formatYmd(parseIsoDate(input.day));
  if (input.unavailable || !isInsideHorizon(day, input.now, input.maxAheadDays)) {
    return [];
  }
  const hours = input.workingDay;
  if (!hours || hours.isClosed || !hours.opensAt || !hours.closesAt) {
    return [];
  }
  if (!isDurationOnStep(input.durationMinutes, input.slotMinutes)) {
    return [];
  }

  const open = parseClockSeconds(hours.opensAt);
  const close = parseClockSeconds(hours.closesAt);
  if (close <= open) {
    return [];
  }

  const pause = breakSeconds(hours);
  const step = input.slotMinutes * 60;
  const duration = input.durationMinutes * 60;
  const earliest = input.now.getTime() + Math.max(0, input.minNoticeMinutes) * 60_000;
  const bufferMs = input.bufferMinutes * 60_000;
  const blocked = input.blockedPeriods.filter((block) => block.startsAt.getTime() < block.endsAt.getTime());
  const occupied = input.occupied.filter(
    (item) => item.dentistId === input.dentistId && occupiesAppointmentSlot(item.status),
  );

  const starts: Date[] = [];
  for (let cursor = Math.ceil(open / step) * step; cursor + duration <= close; cursor += step) {
    if (pause && overlaps(cursor, cursor + duration, pause.start, pause.end)) {
      continue;
    }
    const start = clockOnDay(day, cursor);
    const end = clockOnDay(day, cursor + duration);
    if (start.getTime() < earliest) {
      continue;
    }
    if (
      blocked.some((block) =>
        overlaps(start.getTime(), end.getTime(), block.startsAt.getTime(), block.endsAt.getTime()),
      )
    ) {
      continue;
    }
    if (
      occupied.some((item) =>
        overlaps(start.getTime(), end.getTime() + bufferMs, item.startsAt.getTime(), item.endsAt.getTime() + bufferMs),
      )
    ) {
      continue;
    }
    starts.push(start);
  }
  return starts;
}

function isInsideHorizon(day: string, now: Date, maxAheadDays: number): boolean {
  const today = formatBelgradeDate(now);
  const last = addCalendarDays(today, maxAheadDays);
  return day >= today && day <= last;
}

function isDurationOnStep(durationMinutes: number, slotMinutes: number): boolean {
  return durationMinutes >= slotMinutes && durationMinutes <= 120 && durationMinutes % slotMinutes === 0;
}

function breakSeconds(hours: WorkingInterval): { start: number; end: number } | null {
  if (!hours.breakStartsAt || !hours.breakEndsAt) {
    return null;
  }
  const start = parseClockSeconds(hours.breakStartsAt);
  const end = parseClockSeconds(hours.breakEndsAt);
  if (end <= start) {
    return null;
  }
  return { start, end };
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

function clockOnDay(day: string, totalSeconds: number): Date {
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return localTimeOnDate(day, `${pad(hour)}:${pad(minute)}:${pad(second)}`);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
