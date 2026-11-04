export type DirectoryCoords = { lat: number; lng: number };

export type DirectoryViewMode = "lista" | "mapa";

export const DIRECTORY_PAGE_SIZE = 20;

/** Max radius for „Blizu mene“ when no city or name filter is active. */
export const DIRECTORY_NEAR_ME_RADIUS_KM = 15;

export function directoryNearMeMaxDistanceKm(input: {
  lat?: number;
  lng?: number;
  city?: string;
  name?: string;
}): number | null {
  if (input.lat === undefined || input.lng === undefined) {
    return null;
  }
  if (input.name?.trim()) {
    return null;
  }
  if (input.city?.trim()) {
    return null;
  }
  return DIRECTORY_NEAR_ME_RADIUS_KM;
}

/** Query string for the directory. Safe to call from the server page and the client map. */
export function directoryHref(input: {
  grad?: string;
  pretraga?: string;
  coords?: DirectoryCoords | null;
  prikaz?: DirectoryViewMode;
  strana?: number;
}): string {
  const params = new URLSearchParams();
  if (input.grad) {
    params.set("grad", input.grad);
  }
  if (input.pretraga) {
    params.set("pretraga", input.pretraga);
  }
  if (input.coords) {
    params.set("lat", String(input.coords.lat));
    params.set("lng", String(input.coords.lng));
  }
  if (input.prikaz) {
    params.set("prikaz", input.prikaz);
  }
  if (input.strana && input.strana > 1) {
    params.set("strana", String(input.strana));
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function parseDirectoryPage(raw?: string): number {
  const page = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return page;
}

export function paginateDirectory<T>(
  items: readonly T[],
  page: number,
  pageSize = DIRECTORY_PAGE_SIZE,
): { items: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = (current - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: current,
    pageCount,
  };
}

/** Street and city on one directory line: "Kosančić Ivana 18, Novi Sad". */
export function formatDirectoryAddress(address: string, city: string): string {
  const street = address.trim();
  const place = city.trim();
  if (!place) {
    return street;
  }
  if (!street) {
    return place;
  }
  const suffix = `, ${place}`;
  if (street.toLocaleLowerCase("sr").endsWith(suffix.toLocaleLowerCase("sr"))) {
    return street;
  }
  return `${street}${suffix}`;
}

export function formatDistanceKm(distanceKm: number | null): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return null;
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
