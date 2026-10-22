import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listDirectoryCities,
  searchDirectoryClinics,
  type ClinicDirectoryHit,
} from "@/lib/queries/public";

export const metadata: Metadata = {
  title: "Imenik — DentAssist",
  description: "Pronađite stomatološku ordinaciju sa online zakazivanjem",
};

type PageProps = {
  searchParams: Promise<{
    grad?: string;
    pretraga?: string;
  }>;
};

export default async function DirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const selectedCity = params.grad?.trim() ?? "";
  const nameQuery = params.pretraga?.trim() ?? "";

  const cities = await listDirectoryCities();
  let clinics: ClinicDirectoryHit[] = [];
  if (nameQuery) {
    clinics = await searchDirectoryClinics({ name: nameQuery });
  } else if (selectedCity) {
    clinics = await searchDirectoryClinics({ city: selectedCity });
  }

  const staffEntryUrl = await resolveStaffEntryUrl();
  const showEmptyCity =
    Boolean(selectedCity) && !nameQuery && clinics.length === 0;

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Imenik ordinacija</h1>
          <p className="text-sm text-muted-foreground">
            Izaberite grad ili pretražite naziv ordinacije u celoj Srbiji.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Pretraga naziva</h2>
          <form className="flex flex-col gap-3 sm:flex-row" method="get">
            {selectedCity ? <input type="hidden" name="grad" value={selectedCity} /> : null}
            <Input
              name="pretraga"
              type="search"
              placeholder="Naziv ordinacije"
              defaultValue={nameQuery}
              className="flex-1"
              autoComplete="off"
            />
            <Button type="submit">Pretraži</Button>
          </form>
          {nameQuery ? (
            <p className="text-sm text-muted-foreground">
              Rezultati pretrage za „{nameQuery}“ u celoj zemlji.
              {selectedCity ? (
                <>
                  {" "}
                  <Link
                    href={directoryHref({ grad: selectedCity })}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Vrati se na grad {selectedCity}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        {!nameQuery ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium">Grad</h2>
            {cities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Trenutno nema ordinacija sa online zakazivanjem.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {cities.map((city) => {
                  const active = city === selectedCity;
                  return (
                    <li key={city}>
                      <Link
                        href={directoryHref({ grad: city })}
                        className={
                          active
                            ? "inline-flex rounded-md border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                            : "inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm text-card-foreground shadow-xs hover:bg-muted"
                        }
                      >
                        {city}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {selectedCity || nameQuery ? (
          <section className="space-y-4">
            <h2 className="text-sm font-medium">
              {nameQuery ? "Ordinacije" : `Ordinacije u gradu ${selectedCity}`}
            </h2>
            {showEmptyCity ? (
              <p className="text-sm text-muted-foreground">
                U ovom gradu nema ordinacija sa online zakazivanjem.
              </p>
            ) : null}
            {!showEmptyCity && clinics.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {nameQuery
                  ? "Nema ordinacija koje odgovaraju pretrazi."
                  : "Izaberite grad da vidite ordinacije."}
              </p>
            ) : null}
            <ul className="grid gap-3">
              {clinics.map((clinic) => (
                <li key={clinic.slug}>
                  <Link
                    href={`/ordinacije/${encodeURIComponent(clinic.slug)}`}
                    className="block rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-muted/50"
                  >
                    <p className="font-medium">{clinic.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{clinic.address}</p>
                    {clinic.phone ? (
                      <p className="mt-2 text-sm text-muted-foreground">{clinic.phone}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">Prvo izaberite grad iz liste.</p>
        )}
      </main>

      <footer className="border-t border-border px-4 py-6">
        <div className="mx-auto w-full max-w-3xl">
          <Link
            href={staffEntryUrl}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Za ordinacije
          </Link>
        </div>
      </footer>
    </div>
  );
}

function directoryHref(input: { grad?: string; pretraga?: string }): string {
  const params = new URLSearchParams();
  if (input.grad) {
    params.set("grad", input.grad);
  }
  if (input.pretraga) {
    params.set("pretraga", input.pretraga);
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function resolveStaffEntryUrl(): Promise<string> {
  const fromEnv = process.env.STAFF_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const store = await headers();
  const host = store.get("x-forwarded-host") ?? store.get("host");
  if (!host) {
    return "/za-ordinacije";
  }
  const proto =
    store.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}
