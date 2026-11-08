export type RatingSummary = {
  average: number;
  count: number;
};

export function formatRatingAverage(average: number): string {
  return average.toLocaleString("sr-RS", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatRatingCount(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? "ocena"
      : lastDigit === 1
        ? "ocena"
        : lastDigit >= 2 && lastDigit <= 4
          ? "ocene"
          : "ocena";
  return `${count} ${noun}`;
}
