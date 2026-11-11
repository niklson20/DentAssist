import type { Metadata } from "next";

import { requireOwner } from "@/lib/auth";

import { loadSettingsPinGate } from "../load-pin-gate";
import { SettingsPinView } from "../pin-gate-screen";
import { DevicesPage } from "./devices-page";
import { loadDevicesPage } from "./load-devices";

export const metadata: Metadata = {
  title: "Uređaji",
};

export default async function Page() {
  const member = await requireOwner();
  const gate = await loadSettingsPinGate(member);
  if (gate.status !== "open") {
    return <SettingsPinView gate={gate} />;
  }

  const loaded = await loadDevicesPage(member.clinicId);

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Uređaji</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Povezivanje i isključivanje recepcijskih računara.
        </p>
      </header>

      {loaded.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      ) : (
        <DevicesPage devices={loaded.devices} thisBrowserLinked={loaded.thisBrowserLinked} />
      )}
    </>
  );
}
