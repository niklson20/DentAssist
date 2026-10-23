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

export function formatDistanceKm(distanceKm: number | null): string | null {
  if (distanceKm === null || !Number.isFinite(distanceKm)) {
    return null;
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
