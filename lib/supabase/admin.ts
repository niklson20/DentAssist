import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isInviteCodeHash, type StaffInviteRole } from "@/lib/clinic-invite";

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

export type ClinicInviteUser =
  | { status: "ok"; userId: string }
  | { status: "missing" }
  | { status: "failed" };

export type PasswordWriteResult = {
  status: "ok" | "weak_password" | "rate_limit" | "failed";
};

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

export type StaffInviteRecord =
  | {
      status: "ready";
      email: string;
      codeHash: string;
      role: StaffInviteRole;
      clinicName: string;
      inviterName: string;
    }
  | { status: "invalid" }
  | { status: "failed" };

export type StaffInviteResendStored =
  | {
      status: "ok";
      email: string;
      role: StaffInviteRole;
      clinicName: string;
      inviterName: string;
      previousCodeHash: string;
      previousSendCount: number;
      previousLastSentAt: string | null;
    }
  | { status: "invalid" | "rate_limit" | "failed" };

export type StaffInviteAccepted = {
  status: "ok" | "invalid" | "email_mismatch" | "already_member" | "failed";
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

/**
 * Service role writes the form password to an account the invited email already had.
 * The code proved the mailbox, and a patient and a staff member share one auth user,
 * so this form owns that password. Called only after the clinic is open.
 */
export async function setUserPassword(userId: string, password: string): Promise<PasswordWriteResult> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("Invite password failed: admin environment is not set");
    return { status: "failed" };
  }

  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) {
      if (error.code === "weak_password") {
        return { status: "weak_password" };
      }
      if (error.code === "over_request_rate_limit" || error.status === 429) {
        return { status: "rate_limit" };
      }
      console.error("Invite password rejected:", error.code ?? error.status ?? "unknown");
      return { status: "failed" };
    }
    return { status: "ok" };
  } catch (error) {
    console.error("Invite password failed:", error instanceof Error ? error.name : "unknown error");
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

/**
 * Finds the auth user an invited email already has. The database answers only while
 * the invite is open, and takes the token HMAC, so no user list is read here.
 */
export async function findClinicInviteUser(tokenHash: string): Promise<ClinicInviteUser> {
  const client = createPublishableClient();
  if (!client) {
    console.error("clinic_invite_user_id failed: Supabase environment is not set");
    return { status: "failed" };
  }

  try {
    const { data, error } = await client.rpc("clinic_invite_user_id", { p_token_hash: tokenHash });
    if (error) {
      console.error("clinic_invite_user_id rejected:", error.code ?? "unknown");
      return { status: "failed" };
    }
    if (typeof data !== "string" || !data.trim()) {
      return { status: "missing" };
    }
    return { status: "ok", userId: data.trim() };
  } catch (error) {
    console.error(
      "clinic_invite_user_id failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "failed" };
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

export async function readStaffInvite(tokenHash: string): Promise<StaffInviteRecord> {
  const record = await inviteRpc("read_staff_invite", { p_token_hash: tokenHash });
  if (!record) {
    return { status: "failed" };
  }
  if (record.status === "invalid") {
    return { status: "invalid" };
  }
  if (record.status !== "ready") {
    return { status: "failed" };
  }
  const ready = staffInviteReady(record);
  return ready ?? { status: "failed" };
}

export async function findStaffInviteUser(tokenHash: string): Promise<ClinicInviteUser> {
  const client = createPublishableClient();
  if (!client) {
    console.error("staff_invite_user_id failed: Supabase environment is not set");
    return { status: "failed" };
  }

  try {
    const { data, error } = await client.rpc("staff_invite_user_id", { p_token_hash: tokenHash });
    if (error) {
      console.error("staff_invite_user_id rejected:", error.code ?? "unknown");
      return { status: "failed" };
    }
    if (typeof data !== "string" || !data.trim()) {
      return { status: "missing" };
    }
    return { status: "ok", userId: data.trim() };
  } catch (error) {
    console.error("staff_invite_user_id failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "failed" };
  }
}

export async function recordStaffInviteFailure(tokenHash: string): Promise<ClinicInviteFailure> {
  const record = await inviteRpc("record_staff_invite_failure", { p_token_hash: tokenHash });
  if (record?.status === "wrong" || record?.status === "invalid") {
    return { status: record.status };
  }
  return { status: "failed" };
}

export async function storeStaffInviteResend(
  tokenHash: string,
  codeHash: string,
): Promise<StaffInviteResendStored> {
  const record = await inviteRpc("resend_staff_invite", {
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
  const ready = staffInviteReady({ ...record, status: "ready" });
  const previousCodeHash = record.previous_code_hash;
  const previousSendCount = record.previous_send_count;
  const previousLastSentAt = record.previous_last_sent_at;
  if (
    !ready ||
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
    email: ready.email,
    role: ready.role,
    clinicName: ready.clinicName,
    inviterName: ready.inviterName,
    previousCodeHash,
    previousSendCount,
    previousLastSentAt,
  };
}

export async function revertStaffInviteResend(input: {
  tokenHash: string;
  previousCodeHash: string;
  newCodeHash: string;
  previousSendCount: number;
  previousLastSentAt: string | null;
}): Promise<boolean> {
  const record = await inviteRpc("revert_staff_invite_resend", {
    p_token_hash: input.tokenHash,
    p_previous_code_hash: input.previousCodeHash,
    p_new_code_hash: input.newCodeHash,
    p_previous_send_count: input.previousSendCount,
    p_previous_last_sent_at: input.previousLastSentAt,
  });
  return record?.status === "ok";
}

export async function acceptStaffInviteMembership(input: {
  tokenHash: string;
  codeHash: string;
  userId: string;
}): Promise<StaffInviteAccepted> {
  const record = await inviteRpc("accept_staff_invite", {
    p_token_hash: input.tokenHash,
    p_code_hash: input.codeHash,
    p_user_id: input.userId,
  });
  if (
    record?.status === "ok" ||
    record?.status === "invalid" ||
    record?.status === "email_mismatch" ||
    record?.status === "already_member"
  ) {
    return { status: record.status };
  }
  return { status: "failed" };
}

function staffInviteReady(record: Record<string, unknown>): Extract<StaffInviteRecord, { status: "ready" }> | null {
  const role = record.role === "dentist" || record.role === "reception" ? record.role : null;
  const email = typeof record.email === "string" ? record.email.trim() : "";
  const clinicName = typeof record.clinic_name === "string" ? record.clinic_name.trim() : "";
  const inviterName = typeof record.inviter_name === "string" ? record.inviter_name.trim() : "";
  const codeHash = typeof record.code_hash === "string" ? record.code_hash : "";
  if (!role || !email || !clinicName || !inviterName || !isInviteCodeHash(codeHash)) {
    return null;
  }
  return { status: "ready", email, codeHash, role, clinicName, inviterName };
}

/** Service role reaches the Auth admin API only. Tables and RPC stay out of its reach. */
function createAdminClient(): SupabaseClient | null {
  return keyedClient(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** The invite functions run as anon: their only argument is an HMAC of the link token. */
function createPublishableClient(): SupabaseClient | null {
  return keyedClient(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

function keyedClient(key: string | undefined): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
  const client = createPublishableClient();
  if (!client) {
    console.error(`${fn} failed: Supabase environment is not set`);
    return null;
  }
  try {
    const { data, error } = await client.rpc(fn, args);
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
