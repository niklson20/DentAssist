import { z } from "zod";

import {
  CALENDAR_VIEWS,
  isIsoDate,
  parseCalendarState,
  type CalendarParams,
  type CalendarQuery,
} from "@/lib/calendar-dates";

const CALENDAR_PARAM_KEYS = new Set(["prikaz", "datum", "stomatolog", "sakrijOtkazane"]);

const calendarSearchSchema = z
  .object({
    prikaz: z.union([z.string(), z.array(z.string())]).optional(),
    datum: z.union([z.string(), z.array(z.string())]).optional(),
    stomatolog: z.union([z.string(), z.array(z.string())]).optional(),
    sakrijOtkazane: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strip();

/** Date form. `da` keeps cancelled visits hidden. */
export const calendarDaySchema = z
  .object({
    prikaz: z.enum(CALENDAR_VIEWS, { error: "Izaberite prikaz." }),
    datum: z.string({ error: "Unesite datum." }).trim().refine(isIsoDate, "Unesite datum."),
    stomatolog: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
    sakrijOtkazane: z.enum(["da", "ne"], { error: "Izaberite prikaz otkazanih." }),
  })
  .transform(
    (value): CalendarQuery => ({
      prikaz: value.prikaz,
      datum: value.datum,
      stomatolog: value.stomatolog,
      sakrijOtkazane: value.sakrijOtkazane === "da",
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
  params.set("sakrijOtkazane", query.sakrijOtkazane ? "da" : "ne");
  return params.toString();
}

export function calendarPath(query: CalendarQuery, patch: Partial<CalendarQuery> = {}): string {
  return `/danas?${calendarSearch({ ...query, ...patch })}`;
}

/** The address holds the four calendar params, with cancelled hidden unless the query says otherwise. */
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
  const sakrijOtkazane = firstParam(params, "sakrijOtkazane");
  if (prikaz !== undefined) {
    search.set("prikaz", prikaz);
  }
  if (datum !== undefined) {
    search.set("datum", datum);
  }
  if (stomatolog) {
    search.set("stomatolog", stomatolog);
  }
  if (sakrijOtkazane !== undefined) {
    search.set("sakrijOtkazane", sakrijOtkazane);
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
