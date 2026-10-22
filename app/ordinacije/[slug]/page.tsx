import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getSessionKind } from "@/lib/auth";

import { ClinicProfileView } from "./clinic-profile-view";
import { dentistCookieName } from "./dentist-preference";
import { loadClinicPublic } from "./load-clinic-public";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return { title: "Ordinacija — DentAssist" };
  }
  return {
    title: `${loaded.clinic.name} — DentAssist`,
    description: loaded.clinic.description || `Stomatološka ordinacija u ${loaded.clinic.city}`,
  };
}

export default async function ClinicPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadClinicPublic(slug);

  if (loaded.status !== "ready") {
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <p className="text-center text-sm text-muted-foreground">
          Ova ordinacija nije dostupna za online zakazivanje.
        </p>
      </main>
    );
  }

  const clinic = loaded.clinic;
  const sessionKind = await getSessionKind();
  const isPatient = sessionKind === "patient";
  const cookieStore = await cookies();
  const preferredDentistId = cookieStore.get(dentistCookieName(clinic.slug))?.value ?? null;

  return (
    <ClinicProfileView
      slug={clinic.slug}
      name={clinic.name}
      address={clinic.address}
      phone={clinic.phone}
      description={clinic.description}
      logoUrl={clinic.logoUrl}
      dentists={clinic.dentists}
      initialDentistId={preferredDentistId}
      showPatientAuth={!isPatient}
      showSlotsHint={!isPatient}
    />
  );
}
