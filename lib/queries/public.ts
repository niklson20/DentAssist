import { directoryNearMeMaxDistanceKm } from "@/app/directory-href";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicDirectoryHit = {
  name: string;
  address: string;
  city: string;
  phone: string;
  logoUrl: string | null;
  slug: string;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
};

type ClinicDirectoryRow = {
  name: string;
  address: string;
  city: string;
  phone: string;
  logo_path: string | null;
  slug: string;
  distance_km: number | null;
  latitude: number | null;
  longitude: number | null;
};

export async function listDirectoryCities(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_cities");

  if (error) {
    console.error("listDirectoryCities failed:", error.message);
    return [];
  }

  return ((data as Array<string | { city?: unknown }> | null) ?? [])
    .map((row) => (typeof row === "string" ? row : row.city))
    .filter((city): city is string => typeof city === "string" && city.length > 0);
}

export async function searchDirectoryClinics(input: {
  city?: string;
  name?: string;
  lat?: number;
  lng?: number;
}): Promise<ClinicDirectoryHit[]> {
  const supabase = await createSupabaseServerClient();
  const maxDistanceKm = directoryNearMeMaxDistanceKm({
    lat: input.lat,
    lng: input.lng,
    city: input.city,
    name: input.name,
  });

  const { data, error } = await supabase.rpc("search_clinics", {
    city: input.city?.trim() || null,
    name: input.name?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    max_distance_km: maxDistanceKm,
  });

  if (error) {
    console.error("searchDirectoryClinics failed:", error.message);
    return [];
  }

  let hits = ((data as ClinicDirectoryRow[] | null) ?? []).map((row) =>
    mapDirectoryHit(
      row,
      row.logo_path
        ? supabase.storage.from("clinic-logos").getPublicUrl(row.logo_path).data.publicUrl
        : null,
    ),
  );
  if (maxDistanceKm !== null) {
    hits = hits.filter(
      (hit) => hit.distanceKm !== null && hit.distanceKm <= maxDistanceKm,
    );
  }
  return hits;
}

function mapDirectoryHit(row: ClinicDirectoryRow, logoUrl: string | null): ClinicDirectoryHit {
  return {
    name: row.name,
    address: row.address,
    city: typeof row.city === "string" ? row.city : "",
    phone: row.phone,
    logoUrl,
    slug: row.slug,
    distanceKm: row.distance_km,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}
