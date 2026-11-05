export const REQUEST_PAGE_SIZE = 20;

export const REQUEST_SECTIONS = ["pending", "accepted", "rejected", "expired"] as const;

export type RequestSection = (typeof REQUEST_SECTIONS)[number];

export const REQUEST_SECTION_QUERY: Record<RequestSection, string | null> = {
  pending: null,
  accepted: "prihvaceni",
  rejected: "odbijeni",
  expired: "istekli",
};

export const REQUEST_SECTION_LABELS: Record<RequestSection, string> = {
  pending: "Na čekanju",
  accepted: "Prihvaćeni",
  rejected: "Odbijeni",
  expired: "Istekli",
};

export function requestSectionStatuses(section: RequestSection): readonly string[] {
  if (section === "rejected") return ["rejected", "declined_by_patient"];
  return [section];
}

export function parseRequestSection(value: string | undefined): RequestSection | "invalid" {
  if (value == null || value === "") return "pending";
  const found = (Object.entries(REQUEST_SECTION_QUERY) as [RequestSection, string | null][]).find(
    ([, param]) => param === value,
  );
  return found?.[0] ?? "invalid";
}

export function readRequestPage(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export function requestListPath(section: RequestSection, page = 1): string {
  const params = new URLSearchParams();
  const query = REQUEST_SECTION_QUERY[section];
  if (query) params.set("sekcija", query);
  if (page > 1) params.set("stranica", String(page));
  const search = params.toString();
  return search ? `/zahtevi?${search}` : "/zahtevi";
}
