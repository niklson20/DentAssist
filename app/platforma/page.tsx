import type { Metadata } from "next";

import { requirePlatformAdmin } from "@/lib/auth";
import { listPendingClinicAccessRequests } from "@/lib/queries/platform";

import { AccessRequestsPanel } from "./access-requests";

export const metadata: Metadata = {
  title: "Platforma — DentAssist",
};

export default async function Page() {
  await requirePlatformAdmin();
  const requests = await listPendingClinicAccessRequests();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Platforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zahtevi za otvaranje nove ordinacije.
        </p>
      </header>
      <section aria-labelledby="access-requests-heading">
        <h2 id="access-requests-heading" className="mb-3 text-lg font-medium">
          Zahtevi
        </h2>
        <AccessRequestsPanel requests={requests} />
      </section>
    </main>
  );
}
