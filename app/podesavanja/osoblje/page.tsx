import type { Metadata } from "next";

import { requireOwner } from "@/lib/auth";

import { loadSettingsPinGate } from "../load-pin-gate";
import { SettingsPinView } from "../pin-gate-screen";
import { loadStaffPage } from "./load-staff";
import { StaffPage } from "./staff-page";

export const metadata: Metadata = {
  title: "Osoblje — DentAssist",
};

export default async function Page() {
  const member = await requireOwner();
  const gate = await loadSettingsPinGate(member);
  if (gate.status !== "open") {
    return <SettingsPinView gate={gate} />;
  }

  const loaded = await loadStaffPage(member.clinicId, member.userId);

  if (loaded.status !== "ready") {
    return (
      <>
        <header>
          <h1 className="text-2xl font-semibold">Osoblje</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pozivnice i dostupnost kolege.</p>
        </header>
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      </>
    );
  }

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Osoblje</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pozivnice i dostupnost kolege.</p>
      </header>
      <StaffPage
        ownerMemberId={loaded.ownerMemberId}
        ownerPinSet={loaded.ownerPinSet}
        soleOwner={loaded.soleOwner}
        members={loaded.members}
        pendingInvites={loaded.pendingInvites}
      />
    </>
  );
}
