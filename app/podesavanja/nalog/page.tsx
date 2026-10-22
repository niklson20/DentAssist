import type { Metadata } from "next";

import { requireMember } from "@/lib/auth";

import { AccountForms } from "./account-forms";
import { loadOwnPinState } from "./load-account";

export const metadata: Metadata = {
  title: "Nalog — DentAssist",
};

export default async function Page() {
  await requireMember();
  const pin = await loadOwnPinState();

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Nalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">Lozinka i PIN.</p>
      </header>
      <AccountForms pin={pin} />
    </>
  );
}
