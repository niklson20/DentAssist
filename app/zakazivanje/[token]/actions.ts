"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requirePatient } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { hashInviteToken } from "@/lib/clinic-invite";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { loadManage, type ManagePreview } from "./load-manage";
import { loadOffer, type OfferPreview } from "./load-offer";
import {
  ALREADY_MOVED,
  cancelManageSchema,
  chooseOfferSchema,
  declineOffersSchema,
  findManageSlot,
  invalidOfferLinkText,
  LINK_INVALID,
  manageSlotsSchema,
  MOVE_UNAVAILABLE,
  OFFER_UNAVAILABLE,
  PICK_DAY,
  PICK_OFFER,
  PICK_SLOT,
  rescheduleSchema,
  tooLateText,
  type ManageSlot,
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

type Moved = { status: "rescheduled" };
type CancelledAppointment = { status: "cancelled" };

export async function rescheduleAppointment(
  _previous: ActionResult<Moved> | null,
  formData: FormData,
): Promise<ActionResult<Moved>> {
  const parsed = rescheduleSchema.safeParse({
    token: entry(formData, "token"),
    startsAt: entry(formData, "startsAt"),
  });
  if (!parsed.success) {
    const missingStart = parsed.error.issues.some((issue) => issue.path[0] === "startsAt");
    return fail(missingStart ? PICK_SLOT : LINK_INVALID, fieldErrorsFrom(parsed.error));
  }
  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return fail(PICK_SLOT);
  }
  return saveManage("reschedule", parsed.data.token, formatBelgradeDate(startsAt), parsed.data.startsAt);
}

export async function cancelAppointment(
  _previous: ActionResult<CancelledAppointment> | null,
  formData: FormData,
): Promise<ActionResult<CancelledAppointment>> {
  const parsed = cancelManageSchema.safeParse({
    token: entry(formData, "token"),
  });
  if (!parsed.success) {
    return fail(LINK_INVALID, fieldErrorsFrom(parsed.error));
  }
  return saveManage("cancel", parsed.data.token, null, null);
}

export async function loadManageSlots(
  token: string,
  day: string,
): Promise<ActionResult<{ slots: ManageSlot[] }>> {
  const parsed = manageSlotsSchema.safeParse({ token, day });
  if (!parsed.success) {
    const tokenIssue = parsed.error.issues.some((issue) => issue.path[0] === "token");
    return fail(tokenIssue ? LINK_INVALID : PICK_DAY, fieldErrorsFrom(parsed.error));
  }

  const preview = await loadManage(parsed.data.token, parsed.data.day);
  const slug = manageSlug(preview);
  if (preview.status === "signed_out" || preview.status === "unconfirmed") {
    await requirePatient({ purpose: "request", slug });
    return fail(MOVE_UNAVAILABLE);
  }

  await requirePatient({ purpose: "request", slug });
  if (preview.status === "too_late") {
    return fail(tooLateText(preview.phone));
  }
  if (preview.status !== "ready") {
    return fail(invalidOfferLinkText(managePhone(preview)));
  }
  if (!preview.canReschedule) {
    return fail(ALREADY_MOVED);
  }
  return ok({ slots: preview.slots });
}

async function saveManage(
  kind: "reschedule",
  token: string,
  day: string,
  startsAt: string,
): Promise<ActionResult<Moved>>;
async function saveManage(
  kind: "cancel",
  token: string,
  day: null,
  startsAt: null,
): Promise<ActionResult<CancelledAppointment>>;
async function saveManage(
  kind: "reschedule" | "cancel",
  token: string,
  day: string | null,
  startsAt: string | null,
): Promise<ActionResult<Moved | CancelledAppointment>> {
  const preview = await loadManage(token, day);
  const slug = manageSlug(preview);
  if (preview.status === "signed_out" || preview.status === "unconfirmed") {
    await requirePatient({ purpose: "request", slug });
    return fail(MOVE_UNAVAILABLE);
  }

  await requirePatient({ purpose: "request", slug });
  if (preview.status === "too_late") {
    return fail(tooLateText(preview.phone));
  }
  if (preview.status !== "ready") {
    return fail(invalidOfferLinkText(managePhone(preview)));
  }

  const slot = kind === "reschedule" ? openSlot(preview, startsAt) : null;
  if (kind === "reschedule" && !slot) {
    return fail(preview.canReschedule ? PICK_SLOT : ALREADY_MOVED);
  }

  const tokenHash = hashInviteToken(token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(MOVE_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const result =
      kind === "reschedule"
        ? await supabase.rpc("reschedule_by_token", {
            token: tokenHash,
            starts_at: slot?.startsAt,
          })
        : await supabase.rpc("cancel_by_token", { token: tokenHash });
    if (result.error) {
      return fail(manageFailureText(result.error, preview.phone));
    }
    revalidatePath(`/zakazivanje/${token}`);
    revalidatePath(`/ordinacije/${preview.slug}/termini`);
    return ok(kind === "reschedule" ? { status: "rescheduled" } : { status: "cancelled" });
  } catch (error) {
    console.error(
      kind === "reschedule" ? "reschedule_by_token failed:" : "cancel_by_token failed:",
      error instanceof Error ? error.name : "unknown",
    );
    return fail(MOVE_UNAVAILABLE);
  }
}

function openSlot(preview: Extract<ManagePreview, { status: "ready" }>, startsAt: string | null) {
  if (!preview.canReschedule || !startsAt) {
    return null;
  }
  return findManageSlot(preview.slots, startsAt);
}

function manageFailureText(error: { message?: string; code?: string }, phone: string): string {
  const message = error.message ?? "";
  if (message.includes("already rescheduled")) {
    return ALREADY_MOVED;
  }
  if (message.includes("no longer be rescheduled") || message.includes("no longer be cancelled")) {
    return tooLateText(phone);
  }
  if (message.includes("slot is not available") || message.includes("start is required")) {
    return PICK_SLOT;
  }
  if (
    message.includes("booking link does not match") ||
    message.includes("signed-in patient") ||
    message.includes("confirmed email") ||
    message.includes("booking link is not active") ||
    message.includes("not scheduled")
  ) {
    return invalidOfferLinkText(phone);
  }
  console.error("manage rejected:", error.code ?? "rejected");
  return MOVE_UNAVAILABLE;
}

function manageSlug(preview: ManagePreview): string | undefined {
  return preview.status === "invalid" ? undefined : preview.slug;
}

function managePhone(preview: ManagePreview): string | null {
  if (
    preview.status === "invalid" ||
    preview.status === "mismatch" ||
    preview.status === "ready" ||
    preview.status === "too_late"
  ) {
    return preview.phone;
  }
  return null;
}
