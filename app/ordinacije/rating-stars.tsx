export function RatingStars({
  rating,
  label,
  decorative = false,
}: {
  rating: number;
  label: string;
  decorative?: boolean;
}) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className="inline-flex whitespace-nowrap"
    >
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(100, (rating - index) * 100));

        return (
          <span key={index} aria-hidden="true" className="relative leading-none">
            <span className="text-muted-foreground/40">★</span>
            <span
              className="absolute inset-y-0 left-0 overflow-hidden text-primary"
              style={{ width: `${fill}%` }}
            >
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}
