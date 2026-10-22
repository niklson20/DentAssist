import type { Metadata } from "next";

import { requireOwner } from "@/lib/auth";

import { loadSettingsPinGate } from "../load-pin-gate";
import { SettingsPinView } from "../pin-gate-screen";
import { AppointmentTypesPage } from "./appointment-types-page";
import { loadAppointmentTypesPage } from "./load-appointment-types";

export const metadata: Metadata = {
  title: "Tipovi — DentAssist",
};

export default async function Page() {
  const member = await requireOwner();
  const gate = await loadSettingsPinGate(member);
  if (gate.status !== "open") {
    return <SettingsPinView gate={gate} />;
  }

  const loaded = await loadAppointmentTypesPage(member.clinicId);

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Tipovi</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tipovi termina i podrazumevani tip.</p>
      </header>

      {loaded.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      ) : (
        <AppointmentTypesPage types={loaded.types} defaultTypeId={loaded.defaultTypeId} />
      )}
    </>
  );
}
