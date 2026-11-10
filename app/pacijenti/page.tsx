import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { NewPatientDialog, type NewPatientDraft } from "@/app/pacijenti/new-patient-dialog";
import { patientSearchQuerySchema } from "@/app/pacijenti/search-schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireMember } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";
import {
  createPatientFromList,
  PATIENT_PAGE_SIZE,
  searchClinicPatients,
  type PatientListItem,
} from "@/lib/queries/patients";

export const metadata: Metadata = {
  title: "Pacijenti — DentAssist",
};

type PageProps = {
  searchParams: Promise<{
    pretraga?: string;
    stranica?: string;
    ime?: string;
    prezime?: string;
    telefon?: string;
    datum?: string;
    pol?: string;
    mejl?: string;
    adresa?: string;
    beleska?: string;
    potvrdiIme?: string;
    greska?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const member = await requireMember();
  const params = await searchParams;
  const parsed = patientSearchQuerySchema.safeParse({ pretraga: params.pretraga });
  const searchQuery = parsed.success ? (parsed.data.pretraga ?? "") : "";
  const requestedPage = readPage(params.stranica);
  const listed = await searchClinicPatients(member.clinicId, searchQuery, requestedPage);
  const pageCount = listed.total === 0 ? 0 : Math.ceil(listed.total / PATIENT_PAGE_SIZE);
  if (pageCount > 0 && requestedPage > pageCount) {
    redirect(patientListPath(searchQuery, pageCount));
  }
  const draft: NewPatientDraft = {
    firstName: params.ime?.trim() ?? "",
    lastName: params.prezime?.trim() ?? "",
    phone: params.telefon?.trim() ?? "",
    dateOfBirth: params.datum?.trim() ?? "",
    sex: params.pol === "male" || params.pol === "female" ? params.pol : "",
    email: params.mejl?.trim() ?? "",
    address: params.adresa?.trim() ?? "",
    note: params.beleska?.trim() ?? "",
    needsDuplicateConfirmation: params.potvrdiIme === "1",
    error: params.greska?.trim() ?? "",
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Pacijenti</h1>
        <NewPatientDialog
          action={createPatientFromList}
          clinical={member.role === "owner" || member.role === "dentist"}
          today={formatBelgradeDate(new Date())}
          draft={draft}
        />
      </header>
      <PatientListPanel searchQuery={searchQuery} patients={listed.patients} page={listed.page} total={listed.total} />
    </main>
  );
}

function PatientListPanel({
  searchQuery,
  patients,
  page,
  total,
}: {
  searchQuery: string;
  patients: PatientListItem[];
  page: number;
  total: number;
}) {
  const pageCount = total === 0 ? 0 : Math.ceil(total / PATIENT_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <form className="flex flex-col gap-3 sm:flex-row" method="get">
          <Input
            name="pretraga"
            type="search"
            placeholder="Ime, prezime ili telefon"
            defaultValue={searchQuery}
            className="flex-1"
            autoComplete="off"
          />
          <Button type="submit">Pretraži</Button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-card text-card-foreground">
        {patients.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {searchQuery ? "Nema poklapanja." : "Nema pacijenata."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {patients.map((patient) => {
              const birthDate = listBirthDateLabel(patient.dateOfBirth);
              return (
                <li key={patient.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {patient.lastName} {patient.firstName}
                    </span>
                    {birthDate ? <span className="text-sm text-muted-foreground">{birthDate}</span> : null}
                  </div>
                  <Link
                    href={`/pacijenti/${patient.slug}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Pogledaj karton
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {pageCount > 1 ? (
          <nav aria-label="Stranice pacijenata" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            {page > 1 ? (
              <Link
                href={patientListPath(searchQuery, page - 1)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
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
              <Link
                href={patientListPath(searchQuery, page + 1)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Sledeća
              </Link>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                Sledeća
              </Button>
            )}
          </nav>
        ) : null}
      </section>
    </div>
  );
}

function patientListPath(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) {
    params.set("pretraga", query);
  }
  if (page > 1) {
    params.set("stranica", String(page));
  }
  const search = params.toString();
  return search ? `/pacijenti?${search}` : "/pacijenti";
}

function readPage(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) {
    return 1;
  }
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function listBirthDateLabel(dateOfBirth: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth ?? "");
  if (!match) {
    return null;
  }
  return `${Number(match[3])}. ${Number(match[2])}. ${match[1]}.`;
}
