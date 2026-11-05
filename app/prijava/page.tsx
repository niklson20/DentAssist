import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionKind, homePathFor } from "@/lib/auth";
import { receptionScreen } from "@/lib/reception-pin-ui";
import { patientDirectoryHref } from "@/lib/staff-entry";

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

  const patientHref = patientDirectoryHref({
    staffUrl: process.env.STAFF_URL,
    appUrl: process.env.APP_URL,
    requestOrigin: await requestOrigin(),
  });

  return (
    <div className="flex min-h-svh flex-col">
      <main className="flex flex-1 items-center justify-center p-4">
        {screen.kind === "desk" ? (
          <ReceptionDesk clinicName={screen.desk.clinicName} members={screen.desk.members} />
        ) : (
          <LoginForm />
        )}
      </main>
      <footer className="border-t border-border px-4 py-6">
        <Link href={patientHref} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Za pacijente
        </Link>
      </footer>
    </div>
  );
}

async function requestOrigin(): Promise<string | null> {
  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (!host) {
    return null;
  }
  const proto =
    store.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
