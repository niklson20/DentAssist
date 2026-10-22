import { createClient } from "@supabase/supabase-js";

export type RecoveryTokenResult =
  | { status: "ok"; token: string }
  | { status: "missing" }
  | { status: "rate_limit" }
  | { status: "failed" };

/**
 * Service role is allowed here only to mint a recovery link.
 * The client is not returned, and this function does not read tables.
 */
export async function createRecoveryToken(email: string): Promise<RecoveryTokenResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Recovery link failed: admin environment is not set");
    return { status: "failed" };
  }

  try {
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
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
