import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionKind, homePathFor } from "@/lib/auth";

import { PatientAuthShell } from "../../ordinacije/[slug]/patient-auth-shell";
import { loadPatientAccess } from "../../ordinacije/[slug]/prijava/load-patient-session";
import { RegisterForm } from "../../ordinacije/[slug]/registracija/register-form";

export const metadata: Metadata = {
  title: "Registracija pacijenta — DentAssist",
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

  return (
    <PatientAuthShell>
      <RegisterForm
        mode={access.status === "unconfirmed" ? "code" : "details"}
        email={access.status === "unconfirmed" ? access.email : undefined}
        loginHref="/nalog/prijava"
        turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}
      />
    </PatientAuthShell>
  );
}
