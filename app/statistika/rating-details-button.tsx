"use client";

import { useState, useTransition, type ReactNode } from "react";

import { formatBelgrade } from "@/lib/calendar-dates";
import type { ActionResult } from "@/lib/action-result";

import { loadClinicRatingDetails, type ClinicRatingReview } from "./actions";

export function RatingDetailsButton({
  dentistId,
  label,
  children,
}: {
  dentistId: string | null;
  label: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<ActionResult<ClinicRatingReview[]> | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (result === null || !result.ok) {
      setResult(null);
      startTransition(async () => {
        setResult(await loadClinicRatingDetails(dentistId));
      });
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Sakrij" : "Prikaži"} pojedinačne ocene: ${label}`}
        onClick={toggle}
        disabled={pending}
        className="rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {children}
      </button>
      {expanded ? (
        <div
          aria-label={`Pojedinačne ocene: ${label}`}
          className="w-full min-w-0 space-y-2"
        >
          {pending ? (
            <p role="status" className="text-sm text-muted-foreground">Učitavanje ocena...</p>
          ) : result && !result.ok ? (
            <p role="alert" className="text-sm text-destructive">{result.error}</p>
          ) : result?.ok && result.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema pojedinačnih ocena.</p>
          ) : result?.ok ? (
            <ul className="space-y-2">
              {result.data.map((review) => (
                <li key={review.appointmentId} className="grid w-full min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 rounded-md border border-border bg-background p-3 text-left text-sm sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,.8fr)_minmax(0,1.8fr)] sm:gap-3">
                  <p className="truncate font-medium text-foreground" title={review.reviewerName}>
                    {review.reviewerName}
                  </p>
                  <p className="truncate whitespace-nowrap text-muted-foreground">
                    Termin: {formatBelgrade(new Date(review.startsAt), {
                      day: "numeric",
                      month: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                    <span className="text-muted-foreground">Ordinacija</span>
                    <span className="font-medium tabular-nums text-foreground">{review.clinicRating}/5</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                    <span className="text-muted-foreground">Stomatolog</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {review.dentistRating === null ? "—" : `${review.dentistRating}/5`}
                    </span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground" title={review.dentistName}>
                      {review.dentistName}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
