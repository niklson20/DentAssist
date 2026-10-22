import { z } from "zod";

import { isIsoDate } from "@/lib/calendar-dates";
import { RELATIONSHIPS, type Relationship } from "@/lib/labels";

export const CONFIRM_LINK_UNAVAILABLE = "Povezivanje trenutno nije moguće. Pokušajte ponovo.";

export const PREVIEW_STATUSES = ["open", "expired", "used", "mismatch", "missing", "unavailable"] as const;

export type ChildLinkPreviewStatus = (typeof PREVIEW_STATUSES)[number];

export type ChildLinkPreview = {
  status: ChildLinkPreviewStatus;
};

export type ConfirmedChild = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  relationship: Relationship;
};

const FAILURE_STATUSES = ["expired", "used", "mismatch", "missing", "incomplete"] as const;

export type ChildLinkFailureStatus = (typeof FAILURE_STATUSES)[number];

export type ConfirmChildResult =
  | { status: "ok"; child: ConfirmedChild }
  | { status: ChildLinkFailureStatus };

const confirmedChildSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.string().trim().refine(isIsoDate, "Unesite datum rođenja."),
  relationship: z.enum(RELATIONSHIPS),
});

export const confirmChildLinkSchema = z.object({
  slug: z.string().trim().min(1, "Poziv nije važeći."),
  token: z
    .string()
    .trim()
    .min(20, "Poziv nije važeći.")
    .max(200, "Poziv nije važeći.")
    .regex(/^[A-Za-z0-9_-]+$/, "Poziv nije važeći."),
});

/** Names are kept only when status is ok. Any other payload drops them. */
export function readConfirmResult(data: unknown): ConfirmChildResult | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const status = (data as { status?: unknown }).status;
  if (status === "ok") {
    const record = data as Record<string, unknown>;
    const parsed = confirmedChildSchema.safeParse({
      firstName: record.first_name,
      lastName: record.last_name,
      dateOfBirth: record.date_of_birth,
      relationship: record.relationship,
    });
    return parsed.success ? { status: "ok", child: parsed.data } : null;
  }
  if (typeof status === "string" && isFailureStatus(status)) {
    return { status };
  }
  return null;
}

function isFailureStatus(status: string): status is ChildLinkFailureStatus {
  return (FAILURE_STATUSES as readonly string[]).includes(status);
}
