import type { Metadata } from "next";
import Link from "next/link";

import { requirePatient } from "@/lib/auth";

import { loadClinicPublic } from "../load-clinic-public";
import { CLINIC_UNAVAILABLE } from "../registracija/schema";
import { AppointmentsList } from "./appointments-list";
import { loadMyAppointments } from "./load-appointments";

export const metadata: Metadata = {
  title: "Termini — DentAssist",
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
        <p className="text-center text-sm text-muted-foreground">{CLINIC_UNAVAILABLE}</p>
      </main>
    );
  }

  await requirePatient({ slug: loaded.clinic.slug });
  const appointments = await loadMyAppointments(loaded.clinic.slug);
  const clinicHref = `/ordinacije/${loaded.clinic.slug}`;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
      <header>
        <h1 className="text-2xl font-semibold">Termini</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Termini ovog naloga u ordinaciji {loaded.clinic.name}.
        </p>
      </header>

      {appointments.ok ? (
        <AppointmentsList items={appointments.data} />
      ) : (
        <p className="text-sm text-destructive">{appointments.error}</p>
      )}

      <p className="text-sm">
        <Link href={clinicHref} className="text-primary underline-offset-4 hover:underline">
          Nazad na ordinaciju
        </Link>
      </p>
    </main>
  );
}
