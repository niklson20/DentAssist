import { z } from "zod";

const dentistIdSchema = z.string().uuid();

export type PublicDentist = {
  id: string;
  firstName: string;
  lastName: string;
};

export function dentistCookieName(slug: string): string {
  return `da_dentist_${slug}`;
}

export function dentistStorageKey(slug: string): string {
  return `dentassist:preferred-dentist:${slug}`;
}

export function formatDentistLabel(dentist: PublicDentist): string {
  return `${dentist.firstName} ${dentist.lastName}`.trim();
}

export function pickInitialDentistId(
  dentists: readonly PublicDentist[],
  preferredId: string | null | undefined,
): string | null {
  if (dentists.length === 0) {
    return null;
  }
  if (preferredId && dentists.some((dentist) => dentist.id === preferredId)) {
    return preferredId;
  }
  return dentists[0].id;
}

export function parsePublicDentists(raw: unknown): PublicDentist[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const dentists: PublicDentist[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : null;
    if (!id || !dentistIdSchema.safeParse(id).success) {
      continue;
    }
    dentists.push({
      id,
      firstName: typeof record.first_name === "string" ? record.first_name : "",
      lastName: typeof record.last_name === "string" ? record.last_name : "",
    });
  }
  return dentists;
}

export function persistDentistPreference(slug: string, dentistId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(dentistStorageKey(slug), dentistId);
  const cookieName = dentistCookieName(slug);
  window.document.cookie = `${cookieName}=${dentistId};path=/;max-age=31536000;SameSite=Lax`;
}
