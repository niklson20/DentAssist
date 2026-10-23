import type { Metadata } from "next";
import Link from "next/link";

import {
  DUPLICATE_CONFIRMATION_REQUIRED,
  patientSearchQuerySchema,
} from "@/app/pacijenti/search-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireMember } from "@/lib/auth";
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

  const draft = {
    firstName: params.ime?.trim() ?? "",
    lastName: params.prezime?.trim() ?? "",
    phone: params.telefon?.trim() ?? "",
    needsDuplicateConfirmation: params.potvrdiIme === "1",
    error: params.greska?.trim() ?? "",
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Pacijenti</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pretraga kartona i unos novog pacijenta.</p>
      </header>
      <PatientListPanel searchQuery={searchQuery} patients={patients} draft={draft} />
    </main>
  );
}

function PatientListPanel({
  searchQuery,
  patients,
  draft,
}: {
  searchQuery: string;
  patients: PatientListItem[];
  draft: {
    firstName: string;
    lastName: string;
    phone: string;
    needsDuplicateConfirmation: boolean;
    error: string;
  };
}) {
  const needsDuplicate = draft.needsDuplicateConfirmation;
  const formError = draft.error && draft.error !== DUPLICATE_CONFIRMATION_REQUIRED ? draft.error : "";

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

      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold text-foreground">Novi pacijent</h2>
        <p className="mt-1 text-sm text-muted-foreground">Dva kartona smeju imati isto ime i prezime uz potvrdu.</p>
        <form action={createPatientFromList} className="mt-4 flex max-w-lg flex-col gap-4" noValidate>
          <Field id="patient-first-name" label="Ime" name="firstName" defaultValue={draft.firstName} />
          <Field id="patient-last-name" label="Prezime" name="lastName" defaultValue={draft.lastName} />
          <Field id="patient-phone" label="Telefon" name="phone" type="tel" defaultValue={draft.phone} />
          {needsDuplicate ? (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="duplicateConfirmed"
                value="da"
                className="mt-1 size-4 rounded border border-input"
                required
              />
              <span>Potvrđujem da je ovo drugi pacijent sa istim imenom i prezimenom.</span>
            </label>
          ) : null}
          {needsDuplicate ? (
            <p className="text-sm text-muted-foreground">{DUPLICATE_CONFIRMATION_REQUIRED}</p>
          ) : null}
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <Button type="submit" className="w-fit">Sačuvaj karton</Button>
        </form>
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  name,
  defaultValue,
  type = "text",
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input id={id} name={name} type={type} defaultValue={defaultValue} />
    </div>
  );
}
