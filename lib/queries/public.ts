import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicDirectoryHit = {
  name: string;
  address: string;
  phone: string;
  slug: string;
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
};

type ClinicDirectoryRow = {
  name: string;
  address: string;
  phone: string;
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

  return (data ?? [])
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
  const { data, error } = await supabase.rpc("search_clinics", {
    city: input.city?.trim() || null,
    name: input.name?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
  });

  if (error) {
    console.error("searchDirectoryClinics failed:", error.message);
    return [];
  }

  return ((data as ClinicDirectoryRow[] | null) ?? []).map(mapDirectoryHit);
}

function mapDirectoryHit(row: ClinicDirectoryRow): ClinicDirectoryHit {
  return {
    name: row.name,
    address: row.address,
    phone: row.phone,
    slug: row.slug,
    distanceKm: row.distance_km,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}
