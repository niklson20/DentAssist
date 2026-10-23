"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

import { chooseOffer, declineOffers } from "./actions";
import {
  formatOfferDentist,
  formatOfferWhen,
  NO_OFFERS,
  OFFER_DECLINED,
  TERMIN_CONFIRMED,
  type OfferSlot,
} from "./schema";

type Chosen = { status: "scheduled" };
type Declined = { status: "declined" };

type OfferFormProps = {
  token: string;
  clinicName: string;
  offers: OfferSlot[];
};

export function OfferForm({ token, clinicName, offers }: OfferFormProps) {
  const [choice, chooseAction, choosing] = useActionState<ActionResult<Chosen> | null, FormData>(
    chooseOffer,
    null,
  );
  const [declined, declineAction, declining] = useActionState<ActionResult<Declined> | null, FormData>(
    declineOffers,
    null,
  );
  const pending = choosing || declining;
  const error = actionError(choice) ?? actionError(declined);

  if (choice?.ok) {
    return <p role="status">{TERMIN_CONFIRMED}</p>;
  }
  if (declined?.ok) {
    return <p role="status">{OFFER_DECLINED}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">{clinicName}</p>
      {offers.length === 0 ? <p className="text-sm">{NO_OFFERS}</p> : null}
      {offers.length > 0 ? (
        <form action={chooseAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium">Ponuđeni termini</legend>
            {offers.map((offer, index) => (
              <label
                key={offer.id}
                className="flex items-start gap-3 rounded-md border border-border bg-card p-3 text-card-foreground"
              >
                <input
                  className="mt-1 accent-primary"
                  type="radio"
                  name="offerId"
                  value={offer.id}
                  required={index === 0}
                />
                <span>
                  <span className="block">{formatOfferWhen(offer.startsAt, offer.endsAt)}</span>
                  <span className="block text-sm text-muted-foreground">
                    Stomatolog {formatOfferDentist(offer)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {choosing ? "Potvrda…" : "Potvrdi"}
          </Button>
        </form>
      ) : null}
      <form action={declineAction}>
        <input type="hidden" name="token" value={token} />
        {offers.length === 0 && error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="outline" disabled={pending}>
          {declining ? "Šaljem…" : "Nijedan ne odgovara"}
        </Button>
      </form>
    </div>
  );
}

function actionError(result: ActionResult<unknown> | null): string | null {
  if (!result || result.ok) {
    return null;
  }
  return result.error;
}
