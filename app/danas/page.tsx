import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth";
import { formatBelgradeDate, type CalendarParams } from "@/lib/calendar-dates";

import { CalendarShell } from "./calendar-shell";
import { DayGrid } from "./day-grid";
import { loadDayCalendar } from "./load-day";
import { loadMonthCalendar } from "./load-month";
import { loadWeekCalendar } from "./load-week";
import { MonthView } from "./month-view";
import { calendarPath, hasCanonicalCalendarParams, readCalendarQuery } from "./schema";
import { WeekView } from "./week-view";

export const metadata: Metadata = {
  title: "Danas — DentAssist",
};

type PageProps = {
  searchParams: Promise<CalendarParams>;
};

export default async function Page({ searchParams }: PageProps) {
  const member = await requireMember();
  const params = await searchParams;
  const query = readCalendarQuery(params, formatBelgradeDate(new Date()));
  if (!hasCanonicalCalendarParams(params, query)) {
    redirect(calendarPath(query));
  }

  const day =
    query.prikaz === "dan"
      ? await loadDayCalendar(member.clinicId, query.datum, query.sakrijOtkazane)
      : null;
  const week =
    query.prikaz === "nedelja"
      ? await loadWeekCalendar(member.clinicId, query)
      : null;
  const month =
    query.prikaz === "mesec"
      ? await loadMonthCalendar(member.clinicId, query)
      : null;

  return (
    <CalendarShell
      query={query}
      dayCalendar={
        day ? (
          day.ok ? (
            <DayGrid model={day.data} />
          ) : (
            <p className="p-4 text-sm text-destructive">{day.error}</p>
          )
        ) : null
      }
      weekCalendar={
        week ? (
          week.ok ? (
            <WeekView model={week.data} />
          ) : (
            <p className="p-4 text-sm text-destructive">{week.error}</p>
          )
        ) : null
      }
      monthCalendar={
        month ? (
          month.ok ? (
            <MonthView model={month.data} />
          ) : (
            <p className="p-4 text-sm text-destructive">{month.error}</p>
          )
        ) : null
      }
    />
  );
}
