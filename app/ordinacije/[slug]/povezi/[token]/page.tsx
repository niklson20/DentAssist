import type { Metadata } from "next";

import { requirePatient } from "@/lib/auth";

import { loadClinicPublic } from "../../load-clinic-public";
import { CLINIC_UNAVAILABLE } from "../../registracija/schema";
import { ConfirmChildForm } from "./confirm-form";
import { loadChildLinkPreview } from "./load-child-link";

export const metadata: Metadata = {
  title: "Povezivanje — DentAssist",
};

type PageProps = {
  params: Promise<{ slug: string; token: string }>;
};

export default async function Page({ params }: PageProps) {
  const { slug, token } = await params;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
        <p className="text-center text-sm text-muted-foreground">{CLINIC_UNAVAILABLE}</p>
      </main>
    );
  }

  await requirePatient({ slug: loaded.clinic.slug });
  const preview = await loadChildLinkPreview(loaded.clinic.slug, token);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <ConfirmChildForm
        slug={loaded.clinic.slug}
        token={token}
        clinicName={loaded.clinic.name}
        preview={preview}
      />
    </main>
  );
}
