"use server";

import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import {
  clinicInviteLink,
  hashInviteCode,
  hashInviteToken,
  randomInviteCode,
  staffInviteRoleLabel,
  staffInviteSubject,
  staffInviteText,
} from "@/lib/clinic-invite";
import { MailError, sendMail } from "@/lib/mail";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  memberListedSchema,
  memberUnavailableSchema,
  staffInviteSendSchema,
  transferOwnershipSchema,
} from "./schema";

const STAFF_PATH = "/podesavanja/osoblje";
const SAVE_UNAVAILABLE = "Radnja trenutno nije moguća. Pokušajte ponovo.";
const PIN_REQUIRED = "Pre prve pozivnice postavite PIN na stranici Nalog.";
const SOLE_OWNER_UNAVAILABLE =
  "Poslednji vlasnik ne može biti nedostupan dok ulogu ne preda drugom članu.";
const EMAIL_TAKEN = "Ovaj mejl već pripada ordinaciji ili čeka pozivnicu.";
const TRANSFER_UNAVAILABLE = "Predaja uloge trenutno nije moguća. Pokušajte ponovo.";

type OwnerContext = {
  clinicId: string;
  userId: string;
  memberId: string;
  seesPatients: boolean;
};

export async function sendStaffInvite(
  _previous: ActionResult<{ sent: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  const parsed = staffInviteSendSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const pepper = process.env.TOKEN_PEPPER?.trim();
  if (!pepper) {
    return fail(SAVE_UNAVAILABLE);
  }

  let owner: OwnerContext;
  try {
    owner = await loadOwnerContext();
  } catch {
    return fail(SAVE_UNAVAILABLE);
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return fail(SAVE_UNAVAILABLE);
  }

  const pinSet = await supabase.rpc("own_pin_is_set");
  if (pinSet.error || pinSet.data !== true) {
    return fail(PIN_REQUIRED, { pin: [PIN_REQUIRED] });
  }

  const clinicName = await loadClinicName(supabase, owner.clinicId);
  if (!clinicName) {
    return fail(SAVE_UNAVAILABLE);
  }

  const inviterName = await loadInviterName(supabase, owner.memberId);
  if (!inviterName) {
    return fail(SAVE_UNAVAILABLE);
  }

  if (await memberEmailBlocked(supabase, owner.clinicId, parsed.data.email)) {
    return fail(EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInviteToken(token, pepper);
  if (!tokenHash) {
    return fail(SAVE_UNAVAILABLE);
  }

  const code = randomInviteCode();
  let codeHash: string;
  try {
    codeHash = await hashInviteCode(code);
  } catch (error) {
    console.error("send_staff_invite hash failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }

  const sentAt = new Date().toISOString();
  const { data: invite, error: inviteError } = await supabase
    .from("staff_invites")
    .insert({
      clinic_id: owner.clinicId,
      email: parsed.data.email,
      role: parsed.data.role,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      token_hash: tokenHash,
      code_hash: codeHash,
      created_by: owner.memberId,
      send_count: 1,
      last_sent_at: sentAt,
    })
    .select("id")
    .single();

  if (inviteError || !invite) {
    console.error("send_staff_invite insert failed:", inviteError?.message ?? "missing row");
    return fail(SAVE_UNAVAILABLE);
  }

  const link = clinicInviteLink(token, process.env.STAFF_URL, await requestOrigin());
  if (!link) {
    await deleteStaffInvite(invite.id);
    return fail(SAVE_UNAVAILABLE);
  }

  try {
    await sendMail({
      to: parsed.data.email,
      subject: staffInviteSubject(clinicName),
      text: staffInviteText({
        inviterName,
        roleLabel: staffInviteRoleLabel(parsed.data.role),
        link,
        code,
      }),
    });
  } catch (error) {
    await deleteStaffInvite(invite.id);
    if (error instanceof MailError && error.code === "rate_limit_exceeded") {
      return fail("Previše pokušaja. Pokušajte ponovo za nekoliko minuta.");
    }
    console.error("send_staff_invite mail failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }

  revalidatePath(STAFF_PATH);
  return ok({ sent: true });
}

export async function setMemberUnavailable(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = memberUnavailableSchema.safeParse({
    memberId: formData.get("memberId"),
    unavailable: formData.get("unavailable"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  let owner: OwnerContext;
  try {
    owner = await loadOwnerContext();
  } catch {
    return fail(SAVE_UNAVAILABLE);
  }

  const unavailable = parsed.data.unavailable === "true";
  if (unavailable && parsed.data.memberId === owner.memberId) {
    const soleOwner = await isSoleOwner(owner.clinicId, owner.memberId);
    if (soleOwner) {
      return fail(SOLE_OWNER_UNAVAILABLE);
    }
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clinic_members")
      .update({ unavailable })
      .eq("id", parsed.data.memberId)
      .eq("clinic_id", owner.clinicId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("set_member_unavailable rejected:", error?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }
  } catch (error) {
    console.error("set_member_unavailable failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }

  revalidatePath(STAFF_PATH);
  return ok({ saved: true });
}

export async function setMemberListedOnline(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = memberListedSchema.safeParse({
    memberId: formData.get("memberId"),
    listedOnline: formData.get("listedOnline"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  let owner: OwnerContext;
  try {
    owner = await loadOwnerContext();
  } catch {
    return fail(SAVE_UNAVAILABLE);
  }

  const listedOnline = parsed.data.listedOnline === "true";

  try {
    const supabase = await createSupabaseServerClient();
    const member = await loadMemberRow(supabase, owner.clinicId, parsed.data.memberId);
    if (!member || !member.sees_patients) {
      return fail(SAVE_UNAVAILABLE);
    }

    const { data, error } = await supabase
      .from("clinic_members")
      .update({ listed_online: listedOnline })
      .eq("id", parsed.data.memberId)
      .eq("clinic_id", owner.clinicId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      console.error("set_member_listed_online rejected:", error?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }
  } catch (error) {
    console.error("set_member_listed_online failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }

  revalidatePath(STAFF_PATH);
  return ok({ saved: true });
}

export async function transferClinicOwnership(
  _previous: ActionResult<{ saved: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = transferOwnershipSchema.safeParse({
    targetMemberId: formData.get("targetMemberId"),
  });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  let owner: OwnerContext;
  try {
    owner = await loadOwnerContext();
  } catch {
    return fail(TRANSFER_UNAVAILABLE);
  }

  if (parsed.data.targetMemberId === owner.memberId) {
    return fail(TRANSFER_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const target = await loadMemberRow(supabase, owner.clinicId, parsed.data.targetMemberId);
    if (!target || target.role === "owner" || target.unavailable) {
      return fail(TRANSFER_UNAVAILABLE);
    }

    const promoted = await supabase
      .from("clinic_members")
      .update({ role: "owner" })
      .eq("id", target.id)
      .eq("clinic_id", owner.clinicId)
      .select("id")
      .maybeSingle();
    if (promoted.error || !promoted.data) {
      console.error("transfer_ownership promote rejected:", promoted.error?.code ?? "missing row");
      return fail(TRANSFER_UNAVAILABLE);
    }

    const demotedRole = owner.seesPatients ? "dentist" : "reception";
    const demoted = await supabase
      .from("clinic_members")
      .update({ role: demotedRole })
      .eq("id", owner.memberId)
      .eq("clinic_id", owner.clinicId)
      .eq("role", "owner")
      .select("id")
      .maybeSingle();
    if (demoted.error || !demoted.data) {
      console.error("transfer_ownership demote rejected:", demoted.error?.code ?? "missing row");
      return fail(TRANSFER_UNAVAILABLE);
    }
  } catch (error) {
    console.error("transfer_ownership failed:", error instanceof Error ? error.name : "unknown error");
    return fail(TRANSFER_UNAVAILABLE);
  }

  revalidatePath(STAFF_PATH);
  return ok({ saved: true });
}

async function loadOwnerContext(): Promise<OwnerContext> {
  const session = await requireOwner();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinic_members")
    .select("id, sees_patients")
    .eq("clinic_id", session.clinicId)
    .eq("user_id", session.userId)
    .maybeSingle();

  if (error || !data || typeof data.id !== "string" || typeof data.sees_patients !== "boolean") {
    throw new Error("owner member missing");
  }

  return {
    clinicId: session.clinicId,
    userId: session.userId,
    memberId: data.id,
    seesPatients: data.sees_patients,
  };
}

async function loadClinicName(supabase: SupabaseClient, clinicId: string): Promise<string | null> {
  const { data, error } = await supabase.from("clinics").select("name").eq("id", clinicId).maybeSingle();
  if (error || !data || typeof data.name !== "string" || !data.name.trim()) {
    return null;
  }
  return data.name.trim();
}

async function loadInviterName(supabase: SupabaseClient, memberId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("first_name, last_name")
    .eq("id", memberId)
    .maybeSingle();
  if (
    error ||
    !data ||
    typeof data.first_name !== "string" ||
    typeof data.last_name !== "string" ||
    !data.first_name.trim() ||
    !data.last_name.trim()
  ) {
    return null;
  }
  return `${data.first_name.trim()} ${data.last_name.trim()}`;
}

async function memberEmailBlocked(
  supabase: SupabaseClient,
  clinicId: string,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const { data: invites, error: inviteError } = await supabase
    .from("staff_invites")
    .select("id, expires_at, attempt_count, used_at")
    .eq("clinic_id", clinicId)
    .ilike("email", normalized);

  if (inviteError) {
    console.error("member_email_blocked invites failed:", inviteError.code ?? "unknown");
    return true;
  }

  const now = Date.now();
  const openInvite = (invites ?? []).some(
    (row) =>
      row.used_at === null &&
      typeof row.expires_at === "string" &&
      Date.parse(row.expires_at) > now &&
      typeof row.attempt_count === "number" &&
      row.attempt_count < 5,
  );
  if (openInvite) {
    return true;
  }

  return false;
}

async function loadMemberRow(
  supabase: SupabaseClient,
  clinicId: string,
  memberId: string,
): Promise<{ id: string; role: string; sees_patients: boolean; unavailable: boolean } | null> {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("id, role, sees_patients, unavailable")
    .eq("id", memberId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  if (
    typeof data.id !== "string" ||
    typeof data.role !== "string" ||
    typeof data.sees_patients !== "boolean" ||
    typeof data.unavailable !== "boolean"
  ) {
    return null;
  }
  return data;
}

async function isSoleOwner(clinicId: string, memberId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinic_members")
    .select("id, role")
    .eq("clinic_id", clinicId);

  if (error) {
    console.error("is_sole_owner failed:", error.code ?? "unknown");
    return true;
  }

  const owners = (data ?? []).filter((row) => row.role === "owner");
  return owners.length === 1 && owners[0]?.id === memberId;
}

async function deleteStaffInvite(inviteId: string): Promise<void> {
  const service = createServiceClient();
  if (!service) {
    console.error("delete_staff_invite failed: service client missing");
    return;
  }
  const { error } = await service.from("staff_invites").delete().eq("id", inviteId);
  if (error) {
    console.error("delete_staff_invite failed:", error.message);
  }
}

function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function requestOrigin(): Promise<string | null> {
  const headerStore = await headers();
  const origin = headerStore.get("origin");
  if (origin) {
    return origin;
  }
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) {
    return null;
  }
  const forwarded = headerStore.get("x-forwarded-proto");
  const protocol = forwarded === "http" || forwarded === "https" ? forwarded : "https";
  return `${protocol}://${host}`;
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
