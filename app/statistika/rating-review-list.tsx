import { formatBelgrade } from "@/lib/calendar-dates";
import type { ActionResult } from "@/lib/action-result";

import type { ClinicRatingReview } from "./actions";

export function RatingReviewList({
  result,
}: {
  result: ActionResult<ClinicRatingReview[]>;
}) {
  if (!result.ok) {
    return <p role="alert" className="text-sm text-destructive">{result.error}</p>;
  }

  if (result.data.length === 0) {
    return <p className="text-sm text-muted-foreground">Nema pojedinačnih ocena.</p>;
  }

  return (
    <div aria-label="Poslednjih pet ocena pacijenata" className="w-full min-w-0">
      <ul className="space-y-2">
        {result.data.map((review) => (
          <li
            key={review.appointmentId}
            className="grid w-full min-w-0 grid-cols-2 items-center gap-x-3 gap-y-2 rounded-md border border-border bg-background p-3 text-left text-sm sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,.8fr)_minmax(0,1.8fr)] sm:gap-3"
          >
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
              <span className="font-medium tabular-nums text-foreground">
                {review.clinicRating}/5
              </span>
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
    </div>
  );
}
