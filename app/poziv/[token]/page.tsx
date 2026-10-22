import type { Metadata } from "next";

import { InviteMessage } from "./invite-card";
import { InviteForm } from "./invite-form";
import { loadInviteScreen } from "./load-invite";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const screen = await loadInviteScreen(token);
  if (screen.status === "staff") {
    return { title: `Poziv u ${screen.clinicName} — DentAssist` };
  }
  if (screen.status === "clinic") {
    return { title: "Otvorite ordinaciju — DentAssist" };
  }
  return { title: "Poziv — DentAssist" };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const screen = await loadInviteScreen(token);

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      {screen.status === "clinic" ? (
        <InviteForm kind="clinic" token={token} />
      ) : screen.status === "staff" ? (
        <InviteForm
          kind="staff"
          token={token}
          clinicName={screen.clinicName}
          inviterName={screen.inviterName}
          roleLabel={screen.roleLabel}
        />
      ) : (
        <InviteMessage
          title="Pozivnica"
          message={
            screen.status === "unavailable"
              ? "Pozivnica trenutno ne može da se otvori. Pokušajte ponovo."
              : "Ovaj link više ne važi."
          }
        />
      )}
    </main>
  );
}
