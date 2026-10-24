import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { patientAuthPath, patientReturnPath, readPatientReturnQuery } from "@/lib/auth";

import { PatientAuthShell } from "../patient-auth-shell";
import { CLINIC_UNAVAILABLE } from "../registracija/schema";
import { loadClinicPublic } from "../load-clinic-public";
import { loadPatientAccess } from "./load-patient-session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Prijava — DentAssist",
};

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stomatolog?: string | string[]; pocetak?: string | string[] }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return (
      <PatientAuthShell>
        <p className="text-center text-sm text-muted-foreground">{CLINIC_UNAVAILABLE}</p>
      </PatientAuthShell>
    );
  }

  const clinic = loaded.clinic;
  const saved = readPatientReturnQuery(one(query.stomatolog), one(query.pocetak));
  const access = await loadPatientAccess();
  if (access.status === "confirmed") {
    redirect(patientReturnPath(clinic.slug, saved));
  }
  if (access.status === "unconfirmed") {
    redirect(patientAuthPath(clinic.slug, "registracija", saved));
  }

  return (
    <PatientAuthShell>
      <LoginForm
        slug={clinic.slug}
        clinicName={clinic.name}
        stomatolog={saved.stomatolog}
        pocetak={saved.pocetak}
        registerHref={patientAuthPath(clinic.slug, "registracija", saved)}
        clinicHref={`/ordinacije/${clinic.slug}`}
      />
    </PatientAuthShell>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
