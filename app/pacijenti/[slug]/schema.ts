import { z } from "zod";

import { normalizeClinicSlug } from "@/lib/password-reset";

export const PARENT_LINK_SUBJECT = "Povežite karton deteta";

export const NOT_CLINICAL = "Ovu radnju mogu stomatolog i vlasnik.";

export const CHART_MISSING = "Karton nije pronađen.";

export const BIRTH_DATE_MISSING = "Na kartonu nedostaje datum rođenja.";

export const CONTACT_EMAIL_MISSING = "Na kontaktu nedostaje ispravan mejl.";

export const CHILD_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sendParentLinkSchema = z.object({
  patientSlug: z.string().trim().toLowerCase().regex(CHILD_SLUG, CHART_MISSING),
  contactId: z.string().uuid("Izaberite roditelja."),
});

export function parentLinkUrl(
  appUrl: string | undefined,
  clinicSlug: string,
  token: string,
): string | null {
  const slug = normalizeClinicSlug(clinicSlug);
  const value = token.trim();
  if (!slug || !value) {
    return null;
  }
  let origin: string;
  try {
    const url = new URL((appUrl ?? "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    origin = url.origin;
  } catch {
    return null;
  }
  return `${origin}/ordinacije/${slug}/povezi/${encodeURIComponent(value)}`;
}

/** The mail names the clinic and the link. It does not name the child. */
export function parentLinkText(clinicName: string, link: string): string {
  const name = clinicName.replace(/[\r\n]+/g, " ").trim();
  return `${name} šalje poziv da povežete karton deteta sa nalogom. Ime deteta videćete tek posle potvrde. Link važi 7 dana: ${link}`;
}
