import type { Metadata } from "next";

import { requireMember } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Podešavanja — DentAssist",
};

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireMember();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 py-8">{children}</main>
  );
}
