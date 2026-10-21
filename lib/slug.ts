export type SlugKind = "patient" | "clinic";

const EMPTY_SLUG: Record<SlugKind, string> = {
  patient: "karton",
  clinic: "ordinacija",
};

export function slugify(value: string, kind: SlugKind): string {
  const mapped = value
    .toLowerCase()
    .replace(/ǆ/g, "dz")
    .replace(/đ/g, "dj")
    .replace(/č/g, "c")
    .replace(/ć/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z");
  const dashed = mapped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return dashed || EMPTY_SLUG[kind];
}

export function uniqueSlug(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.includes(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function allocateSlug(value: string, kind: SlugKind, taken: readonly string[]): string {
  return uniqueSlug(slugify(value, kind), taken);
}
