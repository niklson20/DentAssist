import { requireMember } from "@/lib/auth";

import { SettingsSectionList } from "./section-list";
import { settingsSectionsFor } from "./sections";

export default async function Page() {
  const member = await requireMember();
  const sections = settingsSectionsFor(member.role);

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Podešavanja</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {member.role === "reception"
            ? "Vaš nalog."
            : "Odeljci ordinacije."}
        </p>
      </header>
      <nav aria-label="Odeljci podešavanja">
        <SettingsSectionList sections={sections} />
      </nav>
    </>
  );
}
