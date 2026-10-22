import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionKind, homePathFor } from "@/lib/auth";
import { receptionScreen } from "@/lib/reception-pin-ui";

import { loadReceptionDesk } from "./load-desk";
import { LoginForm } from "./login-form";
import { ReceptionDesk } from "./reception-desk";

export const metadata: Metadata = {
  title: "Prijava — DentAssist",
};

export default async function Page() {
  const desk = await loadReceptionDesk();
  const home = desk ? null : homePathFor(await getSessionKind());
  const screen = receptionScreen(desk, home);
  if (screen.kind === "redirect") {
    redirect(screen.href);
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      {screen.kind === "desk" ? (
        <ReceptionDesk clinicName={screen.desk.clinicName} members={screen.desk.members} />
      ) : (
        <LoginForm />
      )}
    </main>
  );
}
