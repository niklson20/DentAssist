import type { Metadata } from "next";

import { requirePlatformAdmin } from "@/lib/auth";
import { listPlatformClinics } from "@/app/actions/platform";
import { listPendingClinicAccessRequests } from "@/lib/queries/platform";

import { AccessRequestsPanel } from "./access-requests";
import { ClinicsPanel } from "./clinics-panel";

export const metadata: Metadata = {
  title: "Platforma — DentAssist",
};

export default async function Page() {
  await requirePlatformAdmin();
  const [requests, clinics] = await Promise.all([
    listPendingClinicAccessRequests(),
    listPlatformClinics(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Platforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zahtevi za nove ordinacije i pregled postojećih.
        </p>
      </header>
      <section aria-labelledby="access-requests-heading">
        <h2 id="access-requests-heading" className="mb-3 text-lg font-medium">
          Zahtevi
        </h2>
        <AccessRequestsPanel requests={requests} />
      </section>
      <section aria-labelledby="clinics-heading">
        <h2 id="clinics-heading" className="mb-3 text-lg font-medium">
          Ordinacije
        </h2>
        <ClinicsPanel clinics={clinics} />
      </section>
    </main>
  );
}
