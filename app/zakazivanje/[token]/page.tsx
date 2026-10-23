import type { Metadata } from "next";

import { requirePatient } from "@/lib/auth";

import { AppointmentDetails, ManageForm } from "./manage-form";
import { loadManage, type ManagePreview } from "./load-manage";
import { loadOffer, type OfferPreview } from "./load-offer";
import { OfferForm } from "./offer-form";
import { invalidOfferLinkText, OFFER_DECLINED, TERMIN_CONFIRMED, tooLateText } from "./schema";

export const metadata: Metadata = {
  title: "Termin — DentAssist",
};

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function Page({ params }: PageProps) {
  const { token } = await params;
  const trimmed = token.trim();
  const offer = await loadOffer(trimmed);
  if (offer.status !== "invalid" || offer.phone) {
    return renderOffer(trimmed, offer);
  }
  return renderManage(trimmed, await loadManage(trimmed));
}

async function renderOffer(token: string, preview: OfferPreview) {
  if (
    preview.status === "signed_out" ||
    preview.status === "unconfirmed" ||
    preview.status === "mismatch" ||
    preview.status === "ready"
  ) {
    await requirePatient({ purpose: "request", slug: preview.slug });
  }

  if (preview.status === "ready") {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
        <header>
          <h1 className="text-2xl font-semibold">Ponuda termina</h1>
        </header>
        <OfferForm token={token} clinicName={preview.clinicName} offers={preview.offers.slice(0, 3)} />
      </main>
    );
  }

  return <OfferNotice text={noticeText(preview)} />;
}

async function renderManage(token: string, preview: ManagePreview) {
  if (
    preview.status === "signed_out" ||
    preview.status === "unconfirmed" ||
    preview.status === "mismatch" ||
    preview.status === "ready" ||
    preview.status === "too_late"
  ) {
    await requirePatient({ purpose: "request", slug: preview.slug });
  }

  if (preview.status === "ready") {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
        <header>
          <h1 className="text-2xl font-semibold">Termin</h1>
        </header>
        <ManageForm
          token={token}
          clinicName={preview.clinicName}
          startsAt={preview.startsAt}
          endsAt={preview.endsAt}
          dentistFirstName={preview.dentistFirstName}
          dentistLastName={preview.dentistLastName}
          canReschedule={preview.canReschedule}
          today={preview.today}
          maxAheadDays={preview.maxAheadDays}
          initialDay={preview.day}
          slots={preview.slots}
        />
      </main>
    );
  }

  if (preview.status === "too_late") {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col gap-6 bg-background p-4 py-8 text-foreground">
        <header>
          <h1 className="text-2xl font-semibold">Termin</h1>
        </header>
        <AppointmentDetails
          clinicName={preview.clinicName}
          startsAt={preview.startsAt}
          endsAt={preview.endsAt}
          dentistFirstName={preview.dentistFirstName}
          dentistLastName={preview.dentistLastName}
        />
        <p>{tooLateText(preview.phone)}</p>
      </main>
    );
  }

  const phone = preview.status === "invalid" || preview.status === "mismatch" ? preview.phone : null;
  return <OfferNotice text={invalidOfferLinkText(phone)} />;
}

function noticeText(preview: OfferPreview): string {
  if (preview.status === "accepted") {
    return TERMIN_CONFIRMED;
  }
  if (preview.status === "declined") {
    return OFFER_DECLINED;
  }
  if (preview.status === "invalid" || preview.status === "mismatch") {
    return invalidOfferLinkText(preview.phone);
  }
  return invalidOfferLinkText(null);
}

function OfferNotice({ text }: { text: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4 text-foreground">
      <p className="max-w-md text-center text-sm">{text}</p>
    </main>
  );
}
