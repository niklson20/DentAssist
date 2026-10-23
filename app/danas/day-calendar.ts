import { z } from "zod";

import {
  BELGRADE_TIME_ZONE,
  formatBelgrade,
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
    is_closed: z.boolean(),
    opens_at: z.string().nullable(),
    closes_at: z.string().nullable(),
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

export type DayGridColumn = {
  id: string;
  name: string;
  visits: DayGridVisit[];
};

export type DayGridModel = {
  span: number;
  hours: DayGridHour[];
  columns: DayGridColumn[];
};

type AxisVisit = {
  startsAt: string;
  endsAt: string;
};

type AxisHour = {
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
};

export function dayFromRows(input: {
  datum: string;
  hideCancelled: boolean;
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
    .filter((row) => !(input.hideCancelled && row.status === "cancelled"))
    .map((row) => ({
      id: row.id,
      dentistId: row.dentist_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      label: (row.patient_id && patientNames.get(row.patient_id)) || appointmentStatusLabel(row.status),
    }));

  const axis = dayAxisHours({
    hours: hours
      .filter((row) => columnIds.has(row.clinic_member_id))
      .map((row) => ({
        isClosed: row.is_closed,
        opensAt: row.opens_at,
        closesAt: row.closes_at,
      })),
    visits,
  });

  return buildDayGrid({
    datum: input.datum,
    columns,
    visits,
    startHour: axis.startHour,
    endHour: axis.endHour,
  });
}

export function dayAxisHours(input: { hours: AxisHour[]; visits: AxisVisit[] }): {
  startHour: number;
  endHour: number;
} {
  let startMin = Number.POSITIVE_INFINITY;
  let endMin = Number.NEGATIVE_INFINITY;

  for (const row of input.hours) {
    if (row.isClosed || !row.opensAt || !row.closesAt) {
      continue;
    }
    const opens = clockToMinutes(row.opensAt);
    const closes = clockToMinutes(row.closesAt);
    if (opens === null || closes === null || closes <= opens) {
      continue;
    }
    startMin = Math.min(startMin, opens);
    endMin = Math.max(endMin, closes);
  }

  for (const visit of input.visits) {
    const start = belgradeClockMinutes(new Date(visit.startsAt));
    const duration = (Date.parse(visit.endsAt) - Date.parse(visit.startsAt)) / 60000;
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
      continue;
    }
    startMin = Math.min(startMin, start);
    endMin = Math.max(endMin, start + duration);
  }

  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    return { startHour: FALLBACK_START_HOUR, endHour: FALLBACK_END_HOUR };
  }

  startMin = Math.max(0, startMin);
  endMin = Math.min(24 * 60, Math.max(endMin, startMin + 1));
  const startHour = Math.min(23, Math.floor(startMin / 60));
  const endHour = Math.max(startHour + 1, Math.min(24, Math.ceil(endMin / 60)));
  return { startHour, endHour };
}

export function buildDayGrid(input: {
  datum: string;
  columns: { id: string; name: string }[];
  visits: {
    id: string;
    dentistId: string;
    status: AppointmentStatus;
    startsAt: string;
    endsAt: string;
    label: string;
  }[];
  startHour: number;
  endHour: number;
}): DayGridModel {
  const span = input.endHour - input.startHour;
  if (input.columns.length === 0 || span <= 0) {
    return { span: 0, hours: [], columns: [] };
  }

  const spanMinutes = span * 60;
  const byDentist = new Map<string, DayGridVisit[]>();
  for (const column of input.columns) {
    byDentist.set(column.id, []);
  }

  const ordered = [...input.visits].sort(
    (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id),
  );

  for (const visit of ordered) {
    const bucket = byDentist.get(visit.dentistId);
    if (!bucket) {
      continue;
    }
    const placed = placeVisit(visit, input.startHour, spanMinutes);
    if (placed) {
      bucket.push(placed);
    }
  }

  const hours: DayGridHour[] = [];
  for (let hour = input.startHour; hour < input.endHour; hour += 1) {
    hours.push({
      hour,
      label: hourLabel(input.datum, hour),
      top: percent((hour - input.startHour) * 60, spanMinutes),
    });
  }

  return {
    span,
    hours,
    columns: input.columns.map((column) => ({
      id: column.id,
      name: column.name,
      visits: byDentist.get(column.id) ?? [],
    })),
  };
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
