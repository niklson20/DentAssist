import type { Metadata } from "next";

import { requireOwner } from "@/lib/auth";

import { loadSettingsPinGate } from "../load-pin-gate";
import { SettingsPinView } from "../pin-gate-screen";
import { ClinicProfileForm } from "./clinic-profile-form";
import { loadClinicProfile } from "./load-clinic";

export const metadata: Metadata = {
  title: "Ordinacija",
};

export default async function Page() {
  const member = await requireOwner();
  const gate = await loadSettingsPinGate(member);
  if (gate.status !== "open") {
    return <SettingsPinView gate={gate} />;
  }

  const loaded = await loadClinicProfile(member.clinicId);

  if (loaded.status !== "ready") {
    return (
      <>
        <header>
          <h1 className="text-2xl font-semibold">Ordinacija</h1>
          <p className="mt-1 text-sm text-muted-foreground">Javni profil i zakazivanje.</p>
        </header>
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      </>
    );
  }

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Ordinacija</h1>
        <p className="mt-1 text-sm text-muted-foreground">Javni profil i zakazivanje.</p>
      </header>
      <ClinicProfileForm clinic={loaded.clinic} publicPageUrl={loaded.publicPageUrl} />
    </>
  );
}
