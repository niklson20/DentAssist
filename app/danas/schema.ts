import { z } from "zod";

import {
  CALENDAR_VIEWS,
  isIsoDate,
  parseCalendarState,
  type CalendarParams,
  type CalendarQuery,
} from "@/lib/calendar-dates";

const CALENDAR_PARAM_KEYS = new Set(["prikaz", "datum", "stomatolog"]);

const calendarSearchSchema = z
  .object({
    prikaz: z.union([z.string(), z.array(z.string())]).optional(),
    datum: z.union([z.string(), z.array(z.string())]).optional(),
    stomatolog: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strip();

/** Date form for the calendar address. */
export const calendarDaySchema = z
  .object({
    prikaz: z.enum(CALENDAR_VIEWS, { error: "Izaberite prikaz." }),
    datum: z.string({ error: "Unesite datum." }).trim().refine(isIsoDate, "Unesite datum."),
    stomatolog: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
  })
  .transform(
    (value): CalendarQuery => ({
      prikaz: value.prikaz,
      datum: value.datum,
      stomatolog: value.stomatolog,
    }),
  );

export function readCalendarQuery(params: CalendarParams, today: string): CalendarQuery {
  if (params instanceof URLSearchParams) {
    return parseCalendarState(params, today);
  }
  const parsed = calendarSearchSchema.safeParse(params);
  return parseCalendarState(parsed.success ? parsed.data : {}, today);
}

export function calendarSearch(query: CalendarQuery): string {
  const params = new URLSearchParams();
  params.set("prikaz", query.prikaz);
  params.set("datum", query.datum);
  if (query.stomatolog) {
    params.set("stomatolog", query.stomatolog);
  }
  return params.toString();
}

export function calendarPath(query: CalendarQuery, patch: Partial<CalendarQuery> = {}): string {
  return `/danas?${calendarSearch({ ...query, ...patch })}`;
}

/** The address holds only the calendar params. */
export function hasCanonicalCalendarParams(params: CalendarParams, query: CalendarQuery): boolean {
  if (!hasOnlyCalendarKeys(params)) {
    return false;
  }
  return serializeIncoming(params) === calendarSearch(query);
}

function hasOnlyCalendarKeys(params: CalendarParams): boolean {
  const keys = params instanceof URLSearchParams ? Array.from(params.keys()) : Object.keys(params);
  return keys.every((key) => CALENDAR_PARAM_KEYS.has(key));
}

function serializeIncoming(params: CalendarParams): string {
  const search = new URLSearchParams();
  const prikaz = firstParam(params, "prikaz");
  const datum = firstParam(params, "datum");
  const stomatolog = firstParam(params, "stomatolog")?.trim();
  if (prikaz !== undefined) {
    search.set("prikaz", prikaz);
  }
  if (datum !== undefined) {
    search.set("datum", datum);
  }
  if (stomatolog) {
    search.set("stomatolog", stomatolog);
  }
  return search.toString();
}

function firstParam(params: CalendarParams, key: string): string | undefined {
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
