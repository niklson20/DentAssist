import type { Metadata } from "next";
import { PatientSignOutButton } from "@/app/ordinacije/[slug]/sign-out-button";
import { PublicSiteFooter, publicSiteFooterClearance } from "@/app/ordinacije/public-site-footer";
import { PublicSiteNav } from "@/app/ordinacije/public-site-nav";
import { requirePatient } from "@/lib/auth";

import { ProfileAppointmentsList } from "./appointments-list";
import { loadProfileAppointments } from "./load-appointments";
import { loadPatientName } from "./load-patient-name";

export const metadata: Metadata = {
  title: "Profil pacijenta — DentAssist",
};

export default async function PatientProfilePage() {
  const patient = await requirePatient();
  const [patientName, appointments] = await Promise.all([
    loadPatientName(patient.accountId),
    loadProfileAppointments(),
  ]);

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav>
        <nav aria-label="Nalog pacijenta" className="flex items-center gap-1">
          <PatientSignOutButton />
        </nav>
      </PublicSiteNav>
      <main
        className={`mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 ${publicSiteFooterClearance}`}
      >
        <header>
          <h1 className="text-2xl font-semibold">
            {patientName.ok
              ? `${patientName.data.firstName} ${patientName.data.lastName}`
              : "Profil"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Najnoviji termini prikazani su prvi.
          </p>
        </header>

        {!patientName.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {patientName.error}
          </p>
        ) : null}

        {appointments.ok ? (
          <ProfileAppointmentsList items={appointments.data} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {appointments.error}
          </p>
        )}

      </main>
      <PublicSiteFooter staffEntryUrl="/prijava" />
    </div>
  );
}
