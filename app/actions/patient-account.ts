"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { loadClinicPublic } from "@/app/ordinacije/[slug]/load-clinic-public";
import { ADD_CHILD_UNAVAILABLE, addChildSchema } from "@/app/ordinacije/[slug]/deca/schema";
import {
  childLinkFailureMessage,
  CHILD_LINK_UNAVAILABLE,
} from "@/app/ordinacije/[slug]/povezi/[token]/link-screen";
import {
  confirmChildLinkSchema,
  readConfirmResult,
  type ConfirmedChild,
} from "@/app/ordinacije/[slug]/povezi/[token]/schema";
import {
  CHART_MISSING,
  CONTACT_EMAIL_MISSING,
  BIRTH_DATE_MISSING,
  NOT_CLINICAL,
  PARENT_LINK_SUBJECT,
  parentLinkText,
  parentLinkUrl,
  sendParentLinkSchema,
} from "@/app/pacijenti/[slug]/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember, requirePatient, type StaffRole } from "@/lib/auth";
import { hashInviteToken } from "@/lib/clinic-invite";
import { MailError, sendMail } from "@/lib/mail";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CLINIC_UNAVAILABLE = "Ova ordinacija nije dostupna za online zakazivanje.";
const SAVE_UNAVAILABLE = "Radnja trenutno nije moguća. Pokušajte ponovo.";
const RATE_LIMIT = "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.";

const contactEmail = z.email();

export async function addChild(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = addChildSchema.safeParse({
    slug: formData.get("slug"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    dateOfBirth: formData.get("dateOfBirth"),
    relationship: formData.get("relationship"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const clinic = await loadClinicPublic(parsed.data.slug);
  if (clinic.status !== "ready") {
    return fail(CLINIC_UNAVAILABLE);
  }

  const patient = await requirePatient({ slug: clinic.clinic.slug });

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("patient_dependents")
      .insert({
        account_id: patient.accountId,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        date_of_birth: parsed.data.dateOfBirth,
        relationship: parsed.data.relationship,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("add_child rejected:", error?.code ?? "rejected");
      return fail(ADD_CHILD_UNAVAILABLE);
    }
  } catch (error) {
    console.error("add_child failed:", error instanceof Error ? error.name : "unknown");
    return fail(ADD_CHILD_UNAVAILABLE);
  }

  revalidatePath(`/ordinacije/${clinic.clinic.slug}/deca`);
  return ok({ saved: true });
}

export async function confirmChildLink(
  _previous: ActionResult<ConfirmedChild> | null,
  formData: FormData,
): Promise<ActionResult<ConfirmedChild>> {
  const parsed = confirmChildLinkSchema.safeParse({
    slug: formData.get("slug"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return fail("Poziv nije važeći.");
  }

  const clinic = await loadClinicPublic(parsed.data.slug);
  if (clinic.status !== "ready") {
    return fail(CLINIC_UNAVAILABLE);
  }

  await requirePatient({ slug: clinic.clinic.slug });

  const tokenHash = hashInviteToken(parsed.data.token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return fail(CHILD_LINK_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("confirm_child_link", {
      p_slug: clinic.clinic.slug,
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("confirm_child_link rejected:", error.code ?? "rejected");
      return fail(CHILD_LINK_UNAVAILABLE);
    }

    const result = readConfirmResult(data);
    if (!result) {
      return fail(CHILD_LINK_UNAVAILABLE);
    }
    if (result.status !== "ok") {
      return fail(childLinkFailureMessage[result.status]);
    }

    revalidatePath(`/ordinacije/${clinic.clinic.slug}/deca`);
    return ok(result.child);
  } catch (error) {
    console.error("confirm_child_link failed:", error instanceof Error ? error.name : "unknown");
    return fail(CHILD_LINK_UNAVAILABLE);
  }
}

export async function sendParentLink(
  _previous: ActionResult<{ sent: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = sendParentLinkSchema.safeParse({
    patientSlug: formData.get("patientSlug"),
    contactId: formData.get("contactId"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const member = await requireMember();
  if (!isClinical(member.role)) {
    return fail(NOT_CLINICAL);
  }

  const pepper = process.env.TOKEN_PEPPER?.trim();
  if (!pepper) {
    return fail(SAVE_UNAVAILABLE);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return fail(SAVE_UNAVAILABLE);
  }

  const memberRow = await supabase
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", member.clinicId)
    .eq("user_id", member.userId)
    .maybeSingle();
  if (memberRow.error || typeof memberRow.data?.id !== "string") {
    console.error("send_parent_link member rejected:", memberRow.error?.code ?? "rejected");
    return fail(SAVE_UNAVAILABLE);
  }

  const clinic = await supabase
    .from("clinics")
    .select("name, slug")
    .eq("id", member.clinicId)
    .maybeSingle();
  if (
    clinic.error ||
    typeof clinic.data?.name !== "string" ||
    typeof clinic.data.slug !== "string" ||
    !clinic.data.name.trim()
  ) {
    console.error("send_parent_link clinic rejected:", clinic.error?.code ?? "rejected");
    return fail(SAVE_UNAVAILABLE);
  }

  const patient = await supabase
    .from("patients")
    .select("id, email, date_of_birth, merged_into_id")
    .eq("clinic_id", member.clinicId)
    .eq("slug", parsed.data.patientSlug)
    .maybeSingle();
  if (patient.error || !patient.data || typeof patient.data.id !== "string") {
    console.error("send_parent_link chart rejected:", patient.error?.code ?? "rejected");
    return fail(CHART_MISSING);
  }
  if (patient.data.merged_into_id != null || hasText(patient.data.email)) {
    return fail(CHART_MISSING);
  }
  if (!hasText(patient.data.date_of_birth)) {
    return fail(BIRTH_DATE_MISSING);
  }

  const contact = await supabase
    .from("patient_contacts")
    .select("id, email")
    .eq("clinic_id", member.clinicId)
    .eq("patient_id", patient.data.id)
    .eq("id", parsed.data.contactId)
    .maybeSingle();
  if (contact.error || typeof contact.data?.email !== "string") {
    console.error("send_parent_link contact rejected:", contact.error?.code ?? "rejected");
    return fail(CONTACT_EMAIL_MISSING);
  }
  const email = contactEmail.safeParse(contact.data.email.trim().toLowerCase());
  if (!email.success) {
    return fail(CONTACT_EMAIL_MISSING);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token, pepper);
  const link = parentLinkUrl(process.env.APP_URL, clinic.data.slug, token);
  if (!tokenHash || !link) {
    return fail(SAVE_UNAVAILABLE);
  }

  const inserted = await supabase
    .from("patient_link_invites")
    .insert({
      clinic_id: member.clinicId,
      patient_id: patient.data.id,
      email: email.data,
      token_hash: tokenHash,
      created_by: memberRow.data.id,
    })
    .select("id")
    .single();
  if (inserted.error || typeof inserted.data?.id !== "string") {
    console.error("send_parent_link insert rejected:", inserted.error?.code ?? "rejected");
    return fail(SAVE_UNAVAILABLE);
  }

  try {
    await sendMail({
      to: email.data,
      subject: PARENT_LINK_SUBJECT,
      text: parentLinkText(clinic.data.name, link),
    });
  } catch (error) {
    await supabase.from("patient_link_invites").delete().eq("id", inserted.data.id);
    if (error instanceof MailError && error.code === "rate_limit_exceeded") {
      return fail(RATE_LIMIT);
    }
    console.error("send_parent_link mail failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }

  revalidatePath(`/pacijenti/${parsed.data.patientSlug}`);
  return ok({ sent: true });
}

function isClinical(role: StaffRole): boolean {
  return role === "owner" || role === "dentist";
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
