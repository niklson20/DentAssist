import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionKind, homePathFor } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Prijava — DentAssist",
};

export default async function Page() {
  const home = homePathFor(await getSessionKind());
  if (home) {
    redirect(home);
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
