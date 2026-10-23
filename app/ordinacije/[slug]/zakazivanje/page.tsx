import type { Metadata } from "next";
import Link from "next/link";

import { requirePatient, readPatientReturnQuery } from "@/lib/auth";
import { formatBelgrade, formatBelgradeDate } from "@/lib/calendar-dates";

import { formatDentistLabel } from "../dentist-preference";
import { loadClinicPublic } from "../load-clinic-public";
import { CLINIC_UNAVAILABLE } from "../registracija/schema";
import { loadSelfBooking } from "./load-self-booking";
import { PICK_SLOT } from "./schema";
import { SelfBookingScreen } from "./self-booking-form";

export const metadata: Metadata = {
  title: "Zakazivanje — DentAssist",
};

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ stomatolog?: string | string[]; pocetak?: string | string[] }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
        <p className="text-center text-sm text-muted-foreground">{CLINIC_UNAVAILABLE}</p>
      </main>
    );
  }

  const clinic = loaded.clinic;
  const saved = readPatientReturnQuery(one(query.stomatolog), one(query.pocetak));
  const patient = await requirePatient({
    purpose: "request",
    slug: clinic.slug,
    stomatolog: saved.stomatolog,
    pocetak: saved.pocetak,
  });
  const clinicHref = `/ordinacije/${clinic.slug}`;

  if (!saved.stomatolog || !saved.pocetak) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
        <header>
          <h1 className="text-2xl font-semibold">Zakazivanje</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ordinacija {clinic.name}.</p>
        </header>
        <p className="text-sm">{PICK_SLOT}</p>
        <BackLink href={clinicHref} />
      </main>
    );
  }

  const booking = await loadSelfBooking(patient.accountId, clinic.slug);
  const dentist = clinic.dentists.find((item) => item.id === saved.stomatolog) ?? null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
      <header>
        <h1 className="text-2xl font-semibold">Zakazivanje</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ordinacija {clinic.name}.</p>
      </header>

      {booking.status === "ready" ? (
        <SelfBookingScreen
          slug={clinic.slug}
          clinicName={clinic.name}
          stomatolog={saved.stomatolog}
          pocetak={saved.pocetak}
          dentistLabel={dentist ? formatDentistLabel(dentist) : null}
          slotLabel={formatSlotLabel(saved.pocetak)}
          today={formatBelgradeDate(new Date())}
          selfLinked={booking.selfLinked}
          profile={booking.profile}
        />
      ) : (
        <p className="text-sm text-destructive">{booking.message}</p>
      )}

      <BackLink href={clinicHref} />
    </main>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <p className="text-sm">
      <Link href={href} className="text-primary underline-offset-4 hover:underline">
        Nazad na ordinaciju
      </Link>
    </p>
  );
}

function formatSlotLabel(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }
  const day = formatBelgrade(start, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
