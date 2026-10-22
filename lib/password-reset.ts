import type { SessionKind } from "@/lib/auth";

const CLINIC_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const PASSWORD_RESET_SUBJECT = "Nova lozinka";

export type PasswordResetAudience = "staff" | "patient";

export function passwordResetText(link: string): string {
  return `Link važi sat vremena: ${link}. Ako niste tražili promenu, zanemarite poruku.`;
}

/** Keeps a real clinic slug. Anything else is dropped so the return path cannot be a foreign URL. */
export function normalizeClinicSlug(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const slug = value.trim().toLowerCase();
  if (!CLINIC_SLUG.test(slug)) {
    return undefined;
  }
  return slug;
}

export function passwordResetLink(input: {
  audience: PasswordResetAudience;
  token: string;
  clinicSlug?: string;
  appUrl?: string;
  staffUrl?: string;
  origin?: string | null;
}): string | null {
  const base = resetBase(input);
  const token = input.token.trim();
  if (!base || !token) {
    return null;
  }
  const path = `${base}/lozinka/${encodeURIComponent(token)}`;
  const slug = input.audience === "patient" ? normalizeClinicSlug(input.clinicSlug) : undefined;
  if (!slug) {
    return path;
  }
  return `${path}?ordinacija=${encodeURIComponent(slug)}`;
}

export function pathAfterPasswordReset(kind: SessionKind, clinicSlug: string | undefined): string | null {
  if (kind === "staff" || kind === "platform") {
    return "/prijava";
  }
  const slug = normalizeClinicSlug(clinicSlug);
  if (kind === "patient" && slug) {
    return `/ordinacije/${slug}/prijava`;
  }
  return null;
}

function resetBase(input: {
  audience: PasswordResetAudience;
  appUrl?: string;
  staffUrl?: string;
  origin?: string | null;
}): string | null {
  const preferred = input.audience === "staff" ? input.staffUrl : input.appUrl;
  return absoluteOrigin(preferred) ?? absoluteOrigin(input.origin);
}

function absoluteOrigin(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
