import { directoryNearMeMaxDistanceKm } from "@/app/directory-href";
import type { RatingSummary } from "@/lib/ratings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { z } from "zod";

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
  rating: RatingSummary | null;
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

const ratingRowSchema = z.object({
  clinic_slug: z.string().min(1),
  dentist_id: z.string().uuid().nullable(),
  rating_average: z.coerce.number().min(1).max(5),
  rating_count: z.coerce.number().int().positive(),
});

export type PublicRatingSummaries = {
  clinics: Map<string, RatingSummary>;
  dentists: Map<string, Map<string, RatingSummary>>;
};

export function publicRatingSummariesFrom(data: unknown): PublicRatingSummaries {
  const summaries: PublicRatingSummaries = {
    clinics: new Map(),
    dentists: new Map(),
  };
  if (!Array.isArray(data)) {
    return summaries;
  }

  for (const rawRow of data) {
    const parsed = ratingRowSchema.safeParse(rawRow);
    if (!parsed.success) {
      continue;
    }

    const { clinic_slug: slug, dentist_id: dentistId, rating_average, rating_count } =
      parsed.data;
    const rating = { average: rating_average, count: rating_count };
    if (dentistId === null) {
      summaries.clinics.set(slug, rating);
    } else {
      const dentists = summaries.dentists.get(slug) ?? new Map<string, RatingSummary>();
      dentists.set(dentistId, rating);
      summaries.dentists.set(slug, dentists);
    }
  }

  return summaries;
}

export async function getPublicRatingSummaries(slugs: string[]): Promise<PublicRatingSummaries> {
  if (slugs.length === 0) {
    return { clinics: new Map(), dentists: new Map() };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_rating_summaries", {
    p_slugs: slugs,
  });

  if (error || (data != null && !Array.isArray(data))) {
    console.error("getPublicRatingSummaries failed:", error?.message ?? "invalid response");
    return { clinics: new Map(), dentists: new Map() };
  }

  return publicRatingSummariesFrom(data ?? []);
}

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
  const ratings = await getPublicRatingSummaries(hits.map((hit) => hit.slug));
  return hits.map((hit) => ({ ...hit, rating: ratings.clinics.get(hit.slug) ?? null }));
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
    rating: null,
  };
}
