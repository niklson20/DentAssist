import type { Metadata } from "next";
import { cookies } from "next/headers";

import { formatBelgradeDate } from "@/lib/calendar-dates";
import { getSessionKind } from "@/lib/auth";

import { buildBookingDayRange } from "./booking-days";
import { PublicSiteFooter, publicSiteFooterClearance } from "../public-site-footer";
import { PublicSiteNav } from "../public-site-nav";
import { resolveStaffEntryUrl } from "../staff-entry-url";
import { ClinicProfileView } from "./clinic-profile-view";
import { dentistCookieName, pickInitialDentistId } from "./dentist-preference";
import { loadAvailableSlots } from "./load-available-slots";
import { loadClinicPublic } from "./load-clinic-public";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadClinicPublic(slug);
  if (loaded.status !== "ready") {
    return { title: "Ordinacija — DentAssist" };
  }
  return {
    title: `${loaded.clinic.name} — DentAssist`,
    description: loaded.clinic.description || `Stomatološka ordinacija u ${loaded.clinic.city}`,
  };
}

export default async function ClinicPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const loaded = await loadClinicPublic(slug);

  if (loaded.status !== "ready") {
    return (
      <div className="relative flex min-h-svh flex-col bg-background text-foreground">
        <PublicSiteNav />
        <main className={`flex flex-1 items-center justify-center px-4 pt-4 ${publicSiteFooterClearance}`}>
          <p className="text-center text-sm text-muted-foreground">
            Ova ordinacija nije dostupna za online zakazivanje.
          </p>
        </main>
        <PublicSiteFooter staffEntryUrl={await resolveStaffEntryUrl()} />
      </div>
    );
  }

  const clinic = loaded.clinic;
  const staffEntryUrl = await resolveStaffEntryUrl();
  const sessionKind = await getSessionKind();
  const isPatient = sessionKind === "patient";
  const cookieStore = await cookies();
  const preferredDentistId = cookieStore.get(dentistCookieName(clinic.slug))?.value ?? null;
  const todayIso = formatBelgradeDate(new Date());
  const bookingDays = buildBookingDayRange(todayIso, clinic.maxAheadDays);
  const activeDentistId = pickInitialDentistId(clinic.dentists, preferredDentistId);
  const initialSlots =
    isPatient && activeDentistId
      ? await loadAvailableSlots(clinic.slug, activeDentistId, todayIso)
      : [];

  return (
    <ClinicProfileView
      slug={clinic.slug}
      name={clinic.name}
      city={clinic.city}
      address={clinic.address}
      phone={clinic.phone}
      description={clinic.description}
      logoUrl={clinic.logoUrl}
      weekdayHours={clinic.weekdayHours}
      weekendHours={clinic.weekendHours}
      weekdayHasSchedule={clinic.weekdayHasSchedule}
      weekendHasSchedule={clinic.weekendHasSchedule}
      dentists={isPatient ? clinic.dentists : []}
      initialDentistId={preferredDentistId}
      showPatientAuth={!isPatient}
      showSlotsHint={!isPatient}
      bookingDays={bookingDays}
      todayIso={todayIso}
      initialSlots={initialSlots}
      staffEntryUrl={staffEntryUrl}
    />
  );
}
