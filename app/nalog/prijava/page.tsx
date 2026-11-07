import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionKind, homePathFor } from "@/lib/auth";

import { PatientAuthShell } from "../../ordinacije/[slug]/patient-auth-shell";
import { loadPatientAccess } from "../../ordinacije/[slug]/prijava/load-patient-session";
import { LoginForm } from "../../ordinacije/[slug]/prijava/login-form";

export const metadata: Metadata = {
  title: "Prijava pacijenta — DentAssist",
};

export default async function Page() {
  const kind = await getSessionKind();
  const home = homePathFor(kind);
  if (home) {
    redirect(home);
  }

  const access = await loadPatientAccess();
  if (access.status === "confirmed") {
    redirect("/");
  }
  if (access.status === "unconfirmed") {
    redirect("/nalog/registracija");
  }

  return (
    <PatientAuthShell>
      <LoginForm registerHref="/nalog/registracija" />
    </PatientAuthShell>
  );
}
