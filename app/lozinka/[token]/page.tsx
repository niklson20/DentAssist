import type { Metadata } from "next";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Nova lozinka — DentAssist",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ordinacija?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const clinicSlug = typeof query.ordinacija === "string" ? query.ordinacija : undefined;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <PasswordForm token={token} clinicSlug={clinicSlug} />
    </main>
  );
}
