import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth";

import { loadWorkingHoursPage } from "./load-working-hours";
import { WorkingHoursForm } from "./working-hours-form";

export const metadata: Metadata = {
  title: "Radno vreme — DentAssist",
};

type PageProps = {
  searchParams: Promise<{ stomatolog?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const member = await requireMember();
  if (member.role === "reception") {
    redirect("/podesavanja/nalog");
  }

  const params = await searchParams;
  const loaded = await loadWorkingHoursPage(
    member.clinicId,
    member.userId,
    member.role,
    params.stomatolog,
  );

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Radno vreme</h1>
        <p className="mt-1 text-sm text-muted-foreground">Dani, sati i pauza.</p>
      </header>

      {loaded.status === "no_dentists" ? (
        <p className="text-sm text-muted-foreground">
          Nema stomatologa koji primaju pacijente. Pozovite stomatologa u odeljku Osoblje.
        </p>
      ) : null}

      {loaded.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      ) : null}

      {loaded.status === "ready" ? (
        <WorkingHoursForm
          canPickDentist={loaded.canPickDentist}
          dentists={loaded.dentists}
          selectedMemberId={loaded.selectedMemberId}
          days={loaded.days}
        />
      ) : null}
    </>
  );
}
