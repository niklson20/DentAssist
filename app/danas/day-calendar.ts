import { z } from "zod";

import {
  BELGRADE_TIME_ZONE,
  formatBelgrade,
  isoDayOfWeek,
  localTimeOnDate,
} from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES, appointmentStatusLabel, type AppointmentStatus } from "@/lib/labels";

const FALLBACK_START_HOUR = 8;
const FALLBACK_END_HOUR = 20;

const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));

const memberSchema = z
  .object({
    id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    sees_patients: z.boolean(),
  })
  .strip();

const appointmentSchema = z
  .object({
    id: z.string().uuid(),
    dentist_id: z.string().uuid(),
    patient_id: z.string().uuid().nullable(),
    starts_at: instant,
    ends_at: instant,
    status: z.enum(APPOINTMENT_STATUSES),
  })
  .strip()
  .refine((row) => Date.parse(row.ends_at) > Date.parse(row.starts_at));

const patientSchema = z
  .object({
    id: z.string().uuid(),
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
  })
  .strip();

const hoursSchema = z
  .object({
    clinic_member_id: z.string().uuid(),
    iso_dow: z.number().int().min(1).max(7).nullable().optional(),
    is_closed: z.boolean(),
    opens_at: z.string().nullable(),
    closes_at: z.string().nullable(),
    break_starts_at: z.string().nullable().optional(),
    break_ends_at: z.string().nullable().optional(),
  })
  .strip();

export type DayGridHour = {
  hour: number;
  label: string;
  top: string;
};

export type DayGridVisit = {
  id: string;
  status: AppointmentStatus;
  label: string;
  timeLabel: string;
  top: string;
  height: string;
};

export type GridBand = {
  top: string;
  height: string;
};

export type GridLine = {
  minute: number;
  top: string;
  hour: boolean;
};

export type DayGridColumn = {
  id: string;
  name: string;
  closed: boolean;
  segments: GridBand[];
  lines: GridLine[];
  breaks: GridBand[];
  visits: DayGridVisit[];
};

export type DayGridModel = {
  datum: string;
  span: number;
  hours: DayGridHour[];
  columns: DayGridColumn[];
};

export type SavedHours = {
  memberId: string;
  dow: number | null;
  closed: boolean;
  opensMin: number | null;
  closesMin: number | null;
  breakStartMin: number | null;
  breakEndMin: number | null;
};

type AxisVisit = {
  startsAt: string;
  endsAt: string;
};

type PlacedVisit = {
  id: string;
  dentistId: string;
  status: AppointmentStatus;
  startsAt: string;
  endsAt: string;
  label: string;
};

export type LaneLayout = {
  closed: boolean;
  segments: GridBand[];
  lines: GridLine[];
  breaks: GridBand[];
  visits: DayGridVisit[];
};

type OpenWindow = {
  startMin: number;
  endMin: number;
};

export function schedulesFromRows(rows: unknown): SavedHours[] | null {
  const parsed = parseRows(rows, hoursSchema);
  if (!parsed) {
    return null;
  }
  return parsed.map((row) => savedHours(row));
}

export function scheduleOn(rows: SavedHours[], memberId: string, dow: number): SavedHours | null {
  const own = rows.filter((row) => row.memberId === memberId);
  return own.find((row) => row.dow === dow) ?? own.find((row) => row.dow === null) ?? null;
}

export function memberHasSavedHours(rows: SavedHours[], memberId: string): boolean {
  return rows.some((row) => row.memberId === memberId);
}

export function closedDows(rows: SavedHours[], memberId: string): Set<number> | null {
  const own = rows.filter((row) => row.memberId === memberId && row.dow !== null);
  if (own.length === 0) {
    return null;
  }
  const present = new Set(own.map((row) => row.dow));
  const closed = new Set<number>();
  for (const row of own) {
    if (row.dow !== null && row.closed) {
      closed.add(row.dow);
    }
  }
  for (let dow = 1; dow <= 7; dow += 1) {
    if (!present.has(dow)) {
      closed.add(dow);
    }
  }
  return closed;
}

export function slotStep(value: unknown): 15 | 30 {
  return value === 30 ? 30 : 15;
}

export function dayFromRows(input: {
  datum: string;
  slotMinutes?: number;
  members: unknown;
  appointments: unknown;
  patients: unknown;
  hours: unknown;
}): DayGridModel | null {
  const members = parseRows(input.members, memberSchema);
  const appointments = parseRows(input.appointments, appointmentSchema);
  const patients = parseRows(input.patients, patientSchema);
  const hours = parseRows(input.hours, hoursSchema);
  if (!members || !appointments || !patients || !hours) {
    return null;
  }

  const columns = members
    .filter((member) => member.sees_patients)
    .map((member) => ({
      id: member.id,
      name: `${member.first_name} ${member.last_name}`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "sr") || left.id.localeCompare(right.id));

  const columnIds = new Set(columns.map((column) => column.id));
  const patientNames = new Map(
    patients.map((patient) => [patient.id, `${patient.first_name} ${patient.last_name}`]),
  );

  const visits = appointments
    .filter((row) => columnIds.has(row.dentist_id))
    .map((row) => ({
      id: row.id,
      dentistId: row.dentist_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      label: (row.patient_id && patientNames.get(row.patient_id)) || appointmentStatusLabel(row.status),
    }));

  const schedules = hours.map((row) => savedHours(row));
  const dow = isoDayOfWeek(input.datum);
  const anySaved = columns.some((column) => memberHasSavedHours(schedules, column.id));
  const axis = axisBounds({
    saved: anySaved,
    schedules: columns.flatMap((column) => {
      const schedule = scheduleOn(schedules, column.id, dow);
      return schedule ? [schedule] : [];
    }),
    visits,
  });
  if (columns.length === 0) {
    return { datum: input.datum, span: 0, hours: [], columns: [] };
  }
  const span = axis.empty ? 0 : axis.endHour - axis.startHour;

  return {
    datum: input.datum,
    span,
    hours: axis.empty ? [] : hourMarks(input.datum, axis.startHour, axis.endHour),
    columns: columns.map((column) => ({
      id: column.id,
      name: column.name,
      ...layoutLane({
        schedule: scheduleOn(schedules, column.id, dow),
        anySaved,
        startHour: axis.startHour,
        endHour: axis.endHour,
        slotMinutes: slotStep(input.slotMinutes),
        visits: visits.filter((visit) => visit.dentistId === column.id),
      }),
    })),
  };
}

export function axisBounds(input: {
  saved: boolean;
  schedules: SavedHours[];
  visits: AxisVisit[];
}): { startHour: number; endHour: number; empty: boolean } {
  let startMin = Number.POSITIVE_INFINITY;
  let endMin = Number.NEGATIVE_INFINITY;
  if (!input.saved) {
    startMin = FALLBACK_START_HOUR * 60;
    endMin = FALLBACK_END_HOUR * 60;
  }

  for (const row of input.schedules) {
    if (row.closed || row.opensMin === null || row.closesMin === null || row.closesMin <= row.opensMin) {
      continue;
    }
    startMin = Math.min(startMin, row.opensMin);
    endMin = Math.max(endMin, row.closesMin);
  }

  for (const visit of input.visits) {
    const range = visitRange(visit);
    if (!range) {
      continue;
    }
    startMin = Math.min(startMin, range.startMin);
    endMin = Math.max(endMin, range.endMin);
  }

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    return { startHour: FALLBACK_START_HOUR, endHour: FALLBACK_START_HOUR, empty: true };
  }

  startMin = Math.max(0, startMin);
  endMin = Math.min(24 * 60, Math.max(endMin, startMin + 1));
  const startHour = Math.min(23, Math.floor(startMin / 60));
  const endHour = Math.max(startHour + 1, Math.min(24, Math.ceil(endMin / 60)));
  return { startHour, endHour, empty: false };
}

export function hourMarks(datum: string, startHour: number, endHour: number): DayGridHour[] {
  const spanMinutes = (endHour - startHour) * 60;
  const hours: DayGridHour[] = [];
  const lastLabeled = Math.min(endHour, 23);
  for (let hour = startHour; hour <= lastLabeled; hour += 1) {
    hours.push({
      hour,
      label: hourLabel(datum, hour),
      top: percent((hour - startHour) * 60, spanMinutes),
    });
  }
  if (endHour === 24) {
    hours.push({ hour: 24, label: "", top: "100%" });
  }
  return hours;
}

export function layoutLane(input: {
  schedule: SavedHours | null;
  anySaved: boolean;
  startHour: number;
  endHour: number;
  slotMinutes: number;
  visits: PlacedVisit[];
}): LaneLayout {
  const spanMinutes = (input.endHour - input.startHour) * 60;
  const axisStart = input.startHour * 60;
  const axisEnd = input.endHour * 60;
  const ordered = [...input.visits].sort(
    (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id),
  );
  const visits: DayGridVisit[] = [];
  for (const visit of ordered) {
    const placed = placeVisit(visit, input.startHour, spanMinutes);
    if (placed) {
      visits.push(placed);
    }
  }

  const window = workWindow(input.schedule, input.anySaved);
  if (!window || spanMinutes <= 0) {
    return { closed: true, segments: [], lines: [], breaks: [], visits };
  }

  const clippedOpen = clipWindow(window.opensMin, window.closesMin, axisStart, axisEnd);
  const openBand = clippedOpen ? band(clippedOpen.startMin, clippedOpen.endMin, axisStart, spanMinutes) : null;
  const breaks: GridBand[] = [];
  const lineWindows: OpenWindow[] = [];
  if (
    window.breakStartMin !== null &&
    window.breakEndMin !== null &&
    window.breakEndMin > window.breakStartMin
  ) {
    lineWindows.push(
      { startMin: window.opensMin, endMin: window.breakStartMin },
      { startMin: window.breakEndMin, endMin: window.closesMin },
    );
    if (clippedOpen) {
      const clippedBreak = clipWindow(
        window.breakStartMin,
        window.breakEndMin,
        clippedOpen.startMin,
        clippedOpen.endMin,
      );
      const breakBand = clippedBreak
        ? band(clippedBreak.startMin, clippedBreak.endMin, axisStart, spanMinutes)
        : null;
      if (breakBand) {
        breaks.push(breakBand);
      }
    }
  } else {
    lineWindows.push({ startMin: window.opensMin, endMin: window.closesMin });
  }

  return {
    closed: false,
    segments: openBand ? [openBand] : [],
    lines: linesFor(lineWindows, axisStart, axisEnd, spanMinutes, input.slotMinutes),
    breaks,
    visits,
  };
}

function savedHours(row: z.infer<typeof hoursSchema>): SavedHours {
  const opensMin = row.opens_at ? clockToMinutes(row.opens_at) : null;
  const closesMin = row.closes_at ? clockToMinutes(row.closes_at) : null;
  const breakStartMin = row.break_starts_at ? clockToMinutes(row.break_starts_at) : null;
  const breakEndMin = row.break_ends_at ? clockToMinutes(row.break_ends_at) : null;
  const open = !row.is_closed && opensMin !== null && closesMin !== null && closesMin > opensMin;
  const paused =
    open &&
    breakStartMin !== null &&
    breakEndMin !== null &&
    breakEndMin > breakStartMin &&
    opensMin !== null &&
    closesMin !== null &&
    breakStartMin >= opensMin &&
    breakEndMin <= closesMin;
  return {
    memberId: row.clinic_member_id,
    dow: row.iso_dow ?? null,
    closed: !open,
    opensMin: open ? opensMin : null,
    closesMin: open ? closesMin : null,
    breakStartMin: paused ? breakStartMin : null,
    breakEndMin: paused ? breakEndMin : null,
  };
}

function workWindow(
  schedule: SavedHours | null,
  anySaved: boolean,
): {
  opensMin: number;
  closesMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
} | null {
  if (schedule) {
    if (schedule.closed || schedule.opensMin === null || schedule.closesMin === null) {
      return null;
    }
    return {
      opensMin: schedule.opensMin,
      closesMin: schedule.closesMin,
      breakStartMin: schedule.breakStartMin,
      breakEndMin: schedule.breakEndMin,
    };
  }
  if (!anySaved) {
    return {
      opensMin: FALLBACK_START_HOUR * 60,
      closesMin: FALLBACK_END_HOUR * 60,
      breakStartMin: null,
      breakEndMin: null,
    };
  }
  return null;
}

function visitRange(visit: AxisVisit): OpenWindow | null {
  const startMin = belgradeClockMinutes(new Date(visit.startsAt));
  const duration = (Date.parse(visit.endsAt) - Date.parse(visit.startsAt)) / 60000;
  if (!Number.isFinite(startMin) || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return { startMin, endMin: startMin + duration };
}

function clipWindow(startMin: number, endMin: number, axisStart: number, axisEnd: number): OpenWindow | null {
  const start = Math.max(startMin, axisStart);
  const end = Math.min(endMin, axisEnd);
  if (end <= start) {
    return null;
  }
  return { startMin: start, endMin: end };
}

function band(startMin: number, endMin: number, axisStart: number, spanMinutes: number): GridBand | null {
  let topMin = startMin - axisStart;
  let heightMin = endMin - startMin;
  if (topMin < 0) {
    heightMin += topMin;
    topMin = 0;
  }
  if (topMin >= spanMinutes || heightMin <= 0) {
    return null;
  }
  if (topMin + heightMin > spanMinutes) {
    heightMin = spanMinutes - topMin;
  }
  return {
    top: percent(topMin, spanMinutes),
    height: percent(heightMin, spanMinutes),
  };
}

function linesFor(
  windows: OpenWindow[],
  axisStart: number,
  axisEnd: number,
  spanMinutes: number,
  slotMinutes: number,
): GridLine[] {
  const step = slotMinutes === 30 ? 30 : 15;
  const lines: GridLine[] = [];
  for (let minute = Math.ceil(axisStart / step) * step; minute < axisEnd; minute += step) {
    const inside = windows.some((window) => {
      const start = Math.max(window.startMin, axisStart);
      const end = Math.min(window.endMin, axisEnd);
      return minute >= start && minute < end;
    });
    if (!inside) {
      continue;
    }
    lines.push({
      minute,
      top: percent(minute - axisStart, spanMinutes),
      hour: minute % 60 === 0,
    });
  }
  return lines;
}

function placeVisit(
  visit: {
    id: string;
    status: AppointmentStatus;
    startsAt: string;
    endsAt: string;
    label: string;
  },
  startHour: number,
  spanMinutes: number,
): DayGridVisit | null {
  const start = belgradeClockMinutes(new Date(visit.startsAt));
  const duration = (Date.parse(visit.endsAt) - Date.parse(visit.startsAt)) / 60000;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0 || spanMinutes <= 0) {
    return null;
  }

  let top = ((start - startHour * 60) / spanMinutes) * 100;
  let height = (duration / spanMinutes) * 100;
  if (top < 0) {
    height += top;
    top = 0;
  }
  if (top >= 100 || height <= 0) {
    return null;
  }
  if (top + height > 100) {
    height = 100 - top;
  }

  return {
    id: visit.id,
    status: visit.status,
    label: visit.label,
    timeLabel: formatRange(visit.startsAt, visit.endsAt),
    top: `${roundPercent(top)}%`,
    height: `${roundPercent(height)}%`,
  };
}

function parseRows<T>(rows: unknown, schema: z.ZodType<T>): T[] | null {
  if (!Array.isArray(rows)) {
    return null;
  }
  const parsed: T[] = [];
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}

function hourLabel(datum: string, hour: number): string {
  return formatBelgrade(localTimeOnDate(datum, `${String(hour).padStart(2, "0")}:00:00`), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRange(startsAt: string, endsAt: string): string {
  const start = formatBelgrade(new Date(startsAt), { hour: "2-digit", minute: "2-digit" });
  const end = formatBelgrade(new Date(endsAt), { hour: "2-digit", minute: "2-digit" });
  return `${start}–${end}`;
}

function belgradeClockMinutes(instantDate: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const value: Record<string, string> = {};
  for (const part of formatter.formatToParts(instantDate)) {
    if (part.type !== "literal") {
      value[part.type] = part.value;
    }
  }
  let hour = Number(value.hour);
  const minute = Number(value.minute);
  if (hour === 24) {
    hour = 0;
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return Number.NaN;
  }
  return hour * 60 + minute;
}

function clockToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour === 24 && minute === 0) {
    return 24 * 60;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function percent(part: number, whole: number): string {
  if (whole <= 0) {
    return "0%";
  }
  return `${roundPercent((part / whole) * 100)}%`;
}

function roundPercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}
