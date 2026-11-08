import { formatRatingAverage, formatRatingCount, type RatingSummary } from "@/lib/ratings";

import { RatingStars } from "./rating-stars";

export function RatingBadge({ rating }: { rating: RatingSummary }) {
  return (
    <span
      role="img"
      aria-label={`Prosečna ocena ${formatRatingAverage(rating.average)} od 5, ${formatRatingCount(rating.count)}`}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-foreground shadow-xs"
    >
      <RatingStars
        rating={rating.average}
        label={`Prosek ${formatRatingAverage(rating.average)} od 5`}
        decorative
      />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-semibold tabular-nums">
          {formatRatingAverage(rating.average)}
          <span className="text-xs font-medium text-muted-foreground">/5</span>
        </span>
        <span className="text-[11px] text-muted-foreground">{formatRatingCount(rating.count)}</span>
      </span>
    </span>
  );
}
