import type { Metadata } from "next";

import { requirePlatformAdmin } from "@/lib/auth";
import { listPlatformClinics } from "@/app/actions/platform";
import { listPendingClinicAccessRequests } from "@/lib/queries/platform";

import { AccessRequestsPanel } from "./access-requests";
import { ClinicsPanel } from "./clinics-panel";
import { SignOutButton } from "./sign-out-button";

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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">DentAssist · Administracija</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Platforma</h1>
        </div>
        <SignOutButton />
      </header>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.8fr)]">
        <section aria-labelledby="clinics-heading" className="min-w-0">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="clinics-heading" className="text-xl font-semibold">Ordinacije</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ukupno ordinacija: {clinics.length}
              </p>
            </div>
          </div>
          <ClinicsPanel clinics={clinics} />
        </section>

        <section aria-labelledby="access-requests-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="access-requests-heading" className="text-lg font-semibold">Zahtevi</h2>
              <p className="mt-1 text-sm text-muted-foreground">Zahtevi za pristup platformi.</p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {requests.length}
            </span>
          </div>
          <AccessRequestsPanel requests={requests} />
        </section>
      </div>
    </main>
  );
}
