import { requireMember } from "@/lib/auth";

import { loadSettingsPinGate } from "./load-pin-gate";
import { SettingsPinView } from "./pin-gate-screen";
import { SettingsSectionList } from "./section-list";
import { settingsSectionsFor } from "./sections";
import { GuideWizard } from "./vodic/guide-wizard";
import { loadGuide } from "./vodic/load-guide";

export default async function Page() {
  const member = await requireMember();
  const gate = await loadSettingsPinGate(member);
  if (gate.status !== "open") {
    return <SettingsPinView gate={gate} />;
  }

  if (member.role === "owner") {
    const guide = await loadGuide(member.clinicId, member.userId);
    if (guide.status === "ready") {
      return (
        <GuideWizard
          step={guide.step}
          clinic={guide.clinic}
          ownerMemberId={guide.ownerMemberId}
          ownerSeesPatients={guide.ownerSeesPatients}
          ownerPinSet={guide.ownerPinSet}
          someoneSeesPatients={guide.someoneSeesPatients}
          pendingDentistInvite={guide.pendingDentistInvite}
        />
      );
    }
  }

  const sections = settingsSectionsFor(member.role);

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Podešavanja</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {member.role === "reception" ? "Vaš nalog." : "Odeljci ordinacije."}
        </p>
      </header>
      <nav aria-label="Odeljci podešavanja">
        <SettingsSectionList sections={sections} />
      </nav>
    </>
  );
}
