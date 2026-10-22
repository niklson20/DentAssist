import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isInviteCodeHash } from "@/lib/clinic-invite";

export type RecoveryTokenResult =
  | { status: "ok"; token: string }
  | { status: "missing" }
  | { status: "rate_limit" }
  | { status: "failed" };

export type ConfirmedUserResult =
  | { status: "ok"; userId: string }
  | { status: "exists" }
  | { status: "weak_password" }
  | { status: "rate_limit" }
  | { status: "failed" };

export type ClinicInviteRecord =
  | { status: "ready"; email: string; codeHash: string }
  | { status: "invalid" }
  | { status: "failed" };

export type ClinicInviteFailure = { status: "wrong" | "invalid" | "failed" };

export type ClinicInviteResendStored =
  | {
      status: "ok";
      email: string;
      previousCodeHash: string;
      previousSendCount: number;
      previousLastSentAt: string | null;
    }
  | { status: "invalid" | "rate_limit" | "failed" };

export type ClinicInviteAccepted = {
  status: "ok" | "invalid" | "invalid_name" | "email_mismatch" | "already_member" | "not_ready" | "failed";
};

/**
 * Service role is allowed here only to mint a recovery link.
 * The client is not returned, and this function does not read tables.
 */
export async function createRecoveryToken(email: string): Promise<RecoveryTokenResult> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Recovery link failed: admin environment is not set");
    return { status: "failed" };
  }

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) {
      if (error.status === 404 || error.code === "user_not_found") {
        return { status: "missing" };
      }
      if (error.status === 429 || error.code === "over_request_rate_limit") {
        return { status: "rate_limit" };
      }
      console.error("Recovery link rejected:", error.code ?? error.status ?? "unknown");
      return { status: "failed" };
    }
    const token = data.properties?.hashed_token?.trim();
    if (!token) {
      console.error("Recovery link rejected: empty token");
      return { status: "failed" };
    }
    return { status: "ok", token };
  } catch (error) {
    console.error("Recovery link failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "failed" };
  }
}

/** Service role creates the auth user after the invite code has been checked. */
export async function createConfirmedUser(email: string, password: string): Promise<ConfirmedUserResult> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Invite user failed: admin environment is not set");
    return { status: "failed" };
  }

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      return classifyCreateUserError(error);
    }
    const userId = data.user?.id;
    if (!userId) {
      console.error("Invite user rejected: empty id");
      return { status: "failed" };
    }
    return { status: "ok", userId };
  } catch (error) {
    console.error("Invite user failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "failed" };
  }
}

/** Removes an auth user when the clinic row could not be opened. */
export async function deleteAuthUser(userId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Invite user cleanup failed: admin environment is not set");
    return;
  }
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Invite user cleanup rejected:", error.code ?? error.status ?? "unknown");
    }
  } catch (error) {
    console.error("Invite user cleanup failed:", error instanceof Error ? error.name : "unknown error");
  }
}

export async function readClinicInvite(tokenHash: string): Promise<ClinicInviteRecord> {
  const record = await inviteRpc("read_clinic_invite", { p_token_hash: tokenHash });
  if (!record) {
    return { status: "failed" };
  }
  if (record.status === "invalid") {
    return { status: "invalid" };
  }
  if (
    record.status === "ready" &&
    typeof record.email === "string" &&
    record.email.trim() &&
    typeof record.code_hash === "string" &&
    isInviteCodeHash(record.code_hash)
  ) {
    return { status: "ready", email: record.email.trim(), codeHash: record.code_hash };
  }
  return { status: "failed" };
}

export async function recordClinicInviteFailure(tokenHash: string): Promise<ClinicInviteFailure> {
  const record = await inviteRpc("record_clinic_invite_failure", { p_token_hash: tokenHash });
  if (record?.status === "wrong" || record?.status === "invalid") {
    return { status: record.status };
  }
  return { status: "failed" };
}

export async function storeClinicInviteResend(
  tokenHash: string,
  codeHash: string,
): Promise<ClinicInviteResendStored> {
  const record = await inviteRpc("resend_clinic_invite", {
    p_token_hash: tokenHash,
    p_code_hash: codeHash,
  });
  if (!record) {
    return { status: "failed" };
  }
  if (record.status === "invalid" || record.status === "rate_limit") {
    return { status: record.status };
  }
  if (record.status !== "ok") {
    return { status: "failed" };
  }
  const previousCodeHash = record.previous_code_hash;
  const previousSendCount = record.previous_send_count;
  const previousLastSentAt = record.previous_last_sent_at;
  if (
    typeof record.email !== "string" ||
    !record.email.trim() ||
    typeof previousCodeHash !== "string" ||
    !isInviteCodeHash(previousCodeHash) ||
    typeof previousSendCount !== "number" ||
    !Number.isInteger(previousSendCount) ||
    previousSendCount < 0 ||
    (previousLastSentAt !== null && typeof previousLastSentAt !== "string")
  ) {
    return { status: "failed" };
  }
  return {
    status: "ok",
    email: record.email.trim(),
    previousCodeHash,
    previousSendCount,
    previousLastSentAt,
  };
}

export async function revertClinicInviteResend(input: {
  tokenHash: string;
  previousCodeHash: string;
  newCodeHash: string;
  previousSendCount: number;
  previousLastSentAt: string | null;
}): Promise<boolean> {
  const record = await inviteRpc("revert_clinic_invite_resend", {
    p_token_hash: input.tokenHash,
    p_previous_code_hash: input.previousCodeHash,
    p_new_code_hash: input.newCodeHash,
    p_previous_send_count: input.previousSendCount,
    p_previous_last_sent_at: input.previousLastSentAt,
  });
  return record?.status === "ok";
}

export async function acceptClinicInviteMembership(input: {
  tokenHash: string;
  codeHash: string;
  userId: string;
  firstName: string;
  lastName: string;
  clinicName: string;
}): Promise<ClinicInviteAccepted> {
  const record = await inviteRpc("accept_clinic_invite", {
    p_token_hash: input.tokenHash,
    p_code_hash: input.codeHash,
    p_user_id: input.userId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_clinic_name: input.clinicName,
  });
  if (
    record?.status === "ok" ||
    record?.status === "invalid" ||
    record?.status === "invalid_name" ||
    record?.status === "email_mismatch" ||
    record?.status === "already_member" ||
    record?.status === "not_ready"
  ) {
    return { status: record.status };
  }
  return { status: "failed" };
}

function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function classifyCreateUserError(error: { code?: string; status?: number }): ConfirmedUserResult {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return { status: "exists" };
  }
  if (error.code === "weak_password") {
    return { status: "weak_password" };
  }
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return { status: "rate_limit" };
  }
  console.error("Invite user rejected:", error.code ?? error.status ?? "unknown");
  return { status: "failed" };
}

async function inviteRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient();
  if (!admin) {
    console.error(`${fn} failed: admin environment is not set`);
    return null;
  }
  try {
    const { data, error } = await admin.rpc(fn, args);
    if (error) {
      console.error(`${fn} rejected:`, error.code ?? "unknown");
      return null;
    }
    return asRecord(data);
  } catch (error) {
    console.error(`${fn} failed:`, error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
