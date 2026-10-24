export type DirectoryCoords = { lat: number; lng: number };

export type DirectoryViewMode = "lista" | "mapa";

/** Query string for the directory. Safe to call from the server page and the client map. */
export function directoryHref(input: {
  grad?: string;
  pretraga?: string;
  coords?: DirectoryCoords | null;
  prikaz?: DirectoryViewMode;
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
  const query = params.toString();
  return query ? `/?${query}` : "/";
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
