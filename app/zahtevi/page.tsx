import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadRequestSection } from "@/app/actions/appointments";
import { loadPatientEmailCharts } from "@/app/actions/patients";
import { PendingColumn } from "@/app/danas/pending-column";
import { PhoneBar } from "@/app/danas/phone-bar";
import { PatientEmailTask } from "@/app/pacijenti/[slug]/email-task";
import { RequestHistoryList } from "@/app/zahtevi/request-history";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireMember } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import {
  REQUEST_PAGE_SIZE,
  REQUEST_SECTION_LABELS,
  REQUEST_SECTIONS,
  parseRequestSection,
  readRequestPage,
  requestListPath,
  type RequestSection,
} from "@/lib/request-section";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Zahtevi — DentAssist",
};

type PageProps = {
  searchParams: Promise<{
    sekcija?: string;
    stranica?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const member = await requireMember();
  const params = await searchParams;
  const section = parseRequestSection(params.sekcija);
  if (section === "invalid") {
    redirect("/zahtevi");
  }
  const requestedPage = readRequestPage(params.stranica);
  const onDate = formatBelgradeDate(new Date());
  const [listed, emailTasks] = await Promise.all([
    loadRequestSection(section, requestedPage),
    section === "pending" ? loadPatientEmailCharts(onDate) : Promise.resolve([]),
  ]);
  const total = listed.ok ? listed.data.total : 0;
  const pageCount = total === 0 ? 0 : Math.ceil(total / REQUEST_PAGE_SIZE);
  if (listed.ok && pageCount > 0 && requestedPage > pageCount) {
    redirect(requestListPath(section, pageCount));
  }
  const counts = listed.ok ? listed.data.counts : { pending: 0, accepted: 0, rejected: 0, expired: 0 };
  const requests = listed.ok ? listed.data.requests : [];
  const page = listed.ok ? listed.data.page : requestedPage;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pb-24 md:pb-4">
      <h1 className="text-2xl font-semibold text-foreground">Zahtevi</h1>
      <nav aria-label="Sekcije zahteva" className="flex flex-wrap gap-2">
        {REQUEST_SECTIONS.map((item) => (
          <Link
            key={item}
            href={requestListPath(item)}
            aria-current={item === section ? "page" : undefined}
            className={cn(buttonVariants({ variant: item === section ? "default" : "outline", size: "sm" }))}
          >
            {REQUEST_SECTION_LABELS[item]} ({counts[item]})
          </Link>
        ))}
      </nav>
      {section === "pending" ? (
        <PendingColumn
          role={member.role}
          requests={requests}
          error={listed.ok ? null : listed.error}
        />
      ) : listed.ok ? (
        <RequestHistoryList section={section} requests={requests} />
      ) : (
        <p className="text-sm text-destructive">{listed.error}</p>
      )}
      <RequestPages section={section} page={page} total={total} />
      {section === "pending"
        ? emailTasks.map((patient) => (
            <PatientEmailTask
              key={patient.slug}
              patientSlug={patient.slug}
              patientName={`${patient.firstName} ${patient.lastName}`}
              hasContact={patient.hasContact}
              dateOfBirth={patient.dateOfBirth}
              email={patient.email}
              emailDeclined={patient.emailDeclined}
              onDate={onDate}
              showName
            />
          ))
        : null}
      <div className="md:hidden">
        <PhoneBar />
      </div>
    </main>
  );
}

function RequestPages({
  section,
  page,
  total,
}: {
  section: RequestSection;
  page: number;
  total: number;
}) {
  const pageCount = total === 0 ? 0 : Math.ceil(total / REQUEST_PAGE_SIZE);
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Stranice zahteva" className="flex flex-wrap items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={requestListPath(section, page - 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Prethodna
        </Link>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Prethodna
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Strana {page} od {pageCount}
      </p>
      {page < pageCount ? (
        <Link href={requestListPath(section, page + 1)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          Sledeća
        </Link>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Sledeća
        </Button>
      )}
    </nav>
  );
}
