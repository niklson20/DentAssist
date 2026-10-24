import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { patientAuthPath, patientReturnPath, readPatientReturnQuery } from "@/lib/auth";

import { PatientAuthShell } from "../patient-auth-shell";
import { loadClinicPublic } from "../load-clinic-public";
import { loadPatientAccess } from "../prijava/load-patient-session";
import { RegisterForm } from "./register-form";
import { CLINIC_UNAVAILABLE } from "./schema";

export const metadata: Metadata = {
  title: "Registracija — DentAssist",
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

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

  return (
    <PatientAuthShell>
      <RegisterForm
        slug={clinic.slug}
        clinicName={clinic.name}
        mode={access.status === "unconfirmed" ? "code" : "details"}
        email={access.status === "unconfirmed" ? access.email : undefined}
        stomatolog={saved.stomatolog}
        pocetak={saved.pocetak}
        loginHref={patientAuthPath(clinic.slug, "prijava", saved)}
        clinicHref={`/ordinacije/${clinic.slug}`}
        turnstileSiteKey={siteKey}
      />
    </PatientAuthShell>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
