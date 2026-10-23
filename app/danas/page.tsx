import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth";
import { formatBelgradeDate, type CalendarParams } from "@/lib/calendar-dates";

import { CalendarShell } from "./calendar-shell";
import { calendarPath, hasCanonicalCalendarParams, readCalendarQuery } from "./schema";

export const metadata: Metadata = {
  title: "Danas — DentAssist",
};

type PageProps = {
  searchParams: Promise<CalendarParams>;
};

export default async function Page({ searchParams }: PageProps) {
  await requireMember();
  const params = await searchParams;
  const query = readCalendarQuery(params, formatBelgradeDate(new Date()));
  if (!hasCanonicalCalendarParams(params, query)) {
    redirect(calendarPath(query));
  }

  return <CalendarShell query={query} />;
}
