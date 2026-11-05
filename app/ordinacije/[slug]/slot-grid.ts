import { BELGRADE_TIME_ZONE } from "@/lib/calendar-dates";

export type SlotClock = {
  startsAt: string;
  hour: number;
  minute: number;
  label: string;
};

export type SlotHourGrid = {
  hours: number[];
  minutes: number[];
  cells: Map<string, SlotClock>;
};

export function buildSlotHourGrid(startsAt: readonly string[]): SlotHourGrid {
  const cells = new Map<string, SlotClock>();
  const hourSet = new Set<number>();
  const minuteSet = new Set<number>();

  for (const value of startsAt) {
    const clock = slotClock(value);
    if (!clock) {
      continue;
    }
    hourSet.add(clock.hour);
    minuteSet.add(clock.minute);
    cells.set(slotCellKey(clock.hour, clock.minute), clock);
  }

  return {
    hours: [...hourSet].sort((left, right) => left - right),
    minutes: [...minuteSet].sort((left, right) => left - right),
    cells,
  };
}

export function slotCellKey(hour: number, minute: number): string {
  return `${hour}:${minute}`;
}

export function slotClock(startsAtIso: string): SlotClock | null {
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BELGRADE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  return {
    startsAt: startsAtIso,
    hour,
    minute,
    label: `${pad(hour)}:${pad(minute)}`,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
