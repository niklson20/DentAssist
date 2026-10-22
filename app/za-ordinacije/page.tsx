import type { Metadata } from "next";

import { loadClinicAccessFormContext } from "@/app/actions/platform";

import { AccessRequestForm } from "./access-form";

export const metadata: Metadata = {
  title: "Za ordinacije — DentAssist",
};

export default async function Page() {
  const context = await loadClinicAccessFormContext();

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      {context.status === "ready" ? (
        <AccessRequestForm
          turnstileRequired={context.turnstileRequired}
          turnstileSiteKey={context.turnstileSiteKey}
        />
      ) : (
        <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
          <h1 className="text-xl font-semibold">Za ordinacije</h1>
          <p className="mt-3 text-sm text-destructive" role="alert">
            Slanje trenutno nije moguće. Pokušajte ponovo.
          </p>
        </section>
      )}
    </main>
  );
}
