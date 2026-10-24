import type { Metadata } from "next";
import Link from "next/link";

import { NewPatientDialog, type NewPatientDraft } from "@/app/pacijenti/new-patient-dialog";
import { patientSearchQuerySchema } from "@/app/pacijenti/search-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireMember } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { createPatientFromList, searchClinicPatients, type PatientListItem } from "@/lib/queries/patients";

export const metadata: Metadata = {
  title: "Pacijenti — DentAssist",
};

type PageProps = {
  searchParams: Promise<{
    pretraga?: string;
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
  const patients = searchQuery ? await searchClinicPatients(member.clinicId, searchQuery) : [];
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
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Pacijenti</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pretraga kartona i unos novog pacijenta.</p>
        </div>
        <NewPatientDialog
          action={createPatientFromList}
          clinical={member.role === "owner" || member.role === "dentist"}
          today={formatBelgradeDate(new Date())}
          draft={draft}
        />
      </header>
      <PatientListPanel searchQuery={searchQuery} patients={patients} />
    </main>
  );
}

function PatientListPanel({
  searchQuery,
  patients,
}: {
  searchQuery: string;
  patients: PatientListItem[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Pretraga</h2>
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
        {searchQuery ? (
          <p className="text-sm text-muted-foreground">Rezultati za „{searchQuery}“.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Unesite ime, prezime ili telefon.</p>
        )}
      </section>

      {searchQuery ? (
        <section className="rounded-lg border border-border bg-card text-card-foreground">
          {patients.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nema poklapanja.</p>
          ) : (
            <ul className="divide-y divide-border">
              {patients.map((patient) => (
                <li key={patient.id}>
                  <Link
                    href={`/pacijenti/${patient.slug}`}
                    className="flex flex-col gap-0.5 px-4 py-3 text-primary hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="font-medium text-foreground">
                      {patient.firstName} {patient.lastName}
                    </span>
                    {patient.phone ? (
                      <span className="text-sm text-muted-foreground">{patient.phone}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
