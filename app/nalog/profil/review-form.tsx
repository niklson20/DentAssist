"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

import { saveAppointmentReview } from "./actions";

export function ReviewForm({
  appointmentId,
  clinicRating,
  dentistRating,
}: {
  appointmentId: string;
  clinicRating: number | null;
  dentistRating: number | null;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveAppointmentReview,
    null,
  );
  const reviewed = clinicRating !== null;

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-border pt-3">
      <input type="hidden" name="appointmentId" value={appointmentId} />
      {reviewed ? (
        <section
          aria-label="Vaše ocene"
          className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-3"
        >
          <h3 className="text-sm font-medium">Vaše ocene</h3>
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Ordinacija</span>
            <span className="font-medium text-foreground">
              <span aria-hidden="true" className="text-primary">★ </span>
              {clinicRating}/5
            </span>
          </p>
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Stomatolog</span>
            {dentistRating === null ? (
              <span className="text-muted-foreground">Nije ocenjeno</span>
            ) : (
              <span className="font-medium text-foreground">
                <span aria-hidden="true" className="text-primary">★ </span>
                {dentistRating}/5
              </span>
            )}
          </p>
        </section>
      ) : null}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Ocena ordinacije</span>
        <select
          name="clinicRating"
          defaultValue={clinicRating?.toString() ?? ""}
          required
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          <option value="" disabled>Izaberite</option>
          {[5, 4, 3, 2, 1].map((rating) => (
            <option key={rating} value={rating}>{rating} / 5</option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Ocena stomatologa (opciono)</span>
        <select
          name="dentistRating"
          defaultValue={dentistRating?.toString() ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2"
        >
          <option value="">Bez ocene</option>
          {[5, 4, 3, 2, 1].map((rating) => (
            <option key={rating} value={rating}>{rating} / 5</option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Čuvanje..." : reviewed ? "Izmeni ocenu" : "Sačuvaj ocenu"}
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="text-sm text-muted-foreground">Ocena je sačuvana.</p>
      ) : null}
    </form>
  );
}
