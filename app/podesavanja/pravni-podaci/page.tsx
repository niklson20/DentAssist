import type { Metadata } from "next";

import { requireOwner } from "@/lib/auth";

import { LegalDataForm } from "./legal-data-form";
import { loadLegalDataPage } from "./load-legal-data";

export const metadata: Metadata = {
  title: "Pravni podaci — DentAssist",
};

export default async function Page() {
  const member = await requireOwner();
  const loaded = await loadLegalDataPage(member.clinicId);

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Pravni podaci</h1>
        <p className="mt-1 text-sm text-muted-foreground">PIB, matični broj i broj rešenja.</p>
      </header>

      {loaded.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      ) : (
        <LegalDataForm fields={loaded.fields} />
      )}
    </>
  );
}
