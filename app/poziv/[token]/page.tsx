import type { Metadata } from "next";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Otvorite ordinaciju — DentAssist",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <InviteForm token={token} />
    </main>
  );
}
