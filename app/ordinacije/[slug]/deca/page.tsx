import type { Metadata } from "next";
import Link from "next/link";

import { requirePatient } from "@/lib/auth";

import { loadClinicPublic } from "../load-clinic-public";
import { CLINIC_UNAVAILABLE } from "../registracija/schema";
import { AddChildForm } from "./add-child-form";
import { ChildrenList } from "./children-list";
import { loadAccountChildren } from "./load-children";

export const metadata: Metadata = {
  title: "Deca — DentAssist",
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
        <p className="text-center text-sm text-muted-foreground">{CLINIC_UNAVAILABLE}</p>
      </main>
    );
  }

  const patient = await requirePatient({ slug: loaded.clinic.slug });
  const children = await loadAccountChildren(patient.accountId);
  const clinicHref = `/ordinacije/${loaded.clinic.slug}`;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
      <header>
        <h1 className="text-2xl font-semibold">Deca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dodajte dete na nalog. Ime sa kartona ordinacije pojavljuje se ovde tek kad potvrdite poziv.
        </p>
      </header>

      {children.status === "ready" ? (
        <ChildrenList items={children.children} />
      ) : (
        <p className="text-sm text-destructive">Spisak trenutno nije dostupan. Pokušajte ponovo.</p>
      )}

      <AddChildForm slug={loaded.clinic.slug} />

      <p className="text-sm">
        <Link href={clinicHref} className="text-primary underline-offset-4 hover:underline">
          Nazad na ordinaciju
        </Link>
      </p>
    </main>
  );
}
