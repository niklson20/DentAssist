"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requirePatient } from "@/lib/auth";
import { hashInviteToken } from "@/lib/clinic-invite";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loadOffer, type OfferPreview } from "./load-offer";
import {
  chooseOfferSchema,
  declineOffersSchema,
  invalidOfferLinkText,
  LINK_INVALID,
  OFFER_UNAVAILABLE,
  PICK_OFFER,
} from "./schema";

const OFFER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Chosen = { status: "scheduled" };
type Declined = { status: "declined" };

export async function chooseOffer(
  _previous: ActionResult<Chosen> | null,
  formData: FormData,
): Promise<ActionResult<Chosen>> {
  const parsed = chooseOfferSchema.safeParse({
    token: entry(formData, "token"),
    offerId: entry(formData, "offerId"),
  });
  if (!parsed.success) {
    const missingOffer = parsed.error.issues.some((issue) => issue.path[0] === "offerId");
    return fail(missingOffer ? PICK_OFFER : LINK_INVALID, fieldErrorsFrom(parsed.error));
  }
  return saveOffer("choose", parsed.data.token, parsed.data.offerId);
}

export async function declineOffers(
  _previous: ActionResult<Declined> | null,
  formData: FormData,
): Promise<ActionResult<Declined>> {
  const parsed = declineOffersSchema.safeParse({
    token: entry(formData, "token"),
  });
  if (!parsed.success) {
    return fail(LINK_INVALID, fieldErrorsFrom(parsed.error));
  }
  return saveOffer("decline", parsed.data.token, null);
}

async function saveOffer(
  kind: "choose",
  token: string,
  offerId: string,
): Promise<ActionResult<Chosen>>;
async function saveOffer(
  kind: "decline",
  token: string,
  offerId: null,
): Promise<ActionResult<Declined>>;
async function saveOffer(
  kind: "choose" | "decline",
  token: string,
  offerId: string | null,
): Promise<ActionResult<Chosen | Declined>> {
  const preview = await loadOffer(token);
  const slug = previewSlug(preview);
  if (preview.status === "signed_out" || preview.status === "unconfirmed") {
    await requirePatient({ purpose: "request", slug });
    return fail(OFFER_UNAVAILABLE);
  }

  await requirePatient({ purpose: "request", slug });
  if (preview.status !== "ready") {
    return fail(invalidOfferLinkText(previewPhone(preview)));
  }
  if (kind === "choose" && !preview.offers.some((offer) => offer.id === offerId)) {
    return fail(PICK_OFFER);
  }

  const tokenHash = hashInviteToken(token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(OFFER_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result =
      kind === "choose"
        ? await supabase.rpc("choose_offer", { token: tokenHash, offer_id: offerId })
        : await supabase.rpc("decline_offers", { token: tokenHash });
    if (result.error) {
      return fail(failureText(result.error, preview.phone));
    }
    if (kind === "choose" && !isOfferId(result.data)) {
      console.error("choose_offer rejected: invalid");
      return fail(OFFER_UNAVAILABLE);
    }
    revalidatePath(`/zakazivanje/${token}`);
    revalidatePath(`/ordinacije/${preview.slug}/termini`);
    return ok(kind === "choose" ? { status: "scheduled" } : { status: "declined" });
  } catch (error) {
    console.error(
      kind === "choose" ? "choose_offer failed:" : "decline_offers failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return fail(OFFER_UNAVAILABLE);
  }
}

function failureText(error: { message?: string; code?: string }, phone: string): string {
  const message = error.message ?? "";
  if (message.includes("offer does not belong") || message.includes("offer is required")) {
    return PICK_OFFER;
  }
  if (
    message.includes("booking link does not match") ||
    message.includes("signed-in patient") ||
    message.includes("confirmed email") ||
    message.includes("booking link is not active") ||
    message.includes("not pending") ||
    message.includes("has expired")
  ) {
    return invalidOfferLinkText(phone);
  }
  console.error("offer rejected:", error.code ?? "rejected");
  return OFFER_UNAVAILABLE;
}

function previewSlug(preview: OfferPreview): string | undefined {
  return preview.status === "invalid" ? undefined : preview.slug;
}

function previewPhone(preview: OfferPreview): string | null {
  if (preview.status === "invalid" || preview.status === "mismatch" || preview.status === "ready") {
    return preview.phone;
  }
  return null;
}

function isOfferId(value: unknown): value is string {
  return typeof value === "string" && OFFER_ID.test(value);
}

function entry(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
