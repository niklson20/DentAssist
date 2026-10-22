import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PatientAccess =
  | { status: "anonymous" }
  | { status: "other" }
  | { status: "unconfirmed"; email: string }
  | { status: "confirmed" };

export async function loadPatientAccess(): Promise<PatientAccess> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { status: "anonymous" };
    }

    const account = await supabase
      .from("patient_accounts")
      .select("email, email_confirmed_at")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (account.error) {
      console.error("patient access read rejected:", account.error.code ?? "unknown");
      return { status: "other" };
    }
    if (!account.data || typeof account.data.email !== "string") {
      return { status: "other" };
    }
    if (typeof account.data.email_confirmed_at === "string" && account.data.email_confirmed_at.length > 0) {
      return { status: "confirmed" };
    }
    return { status: "unconfirmed", email: account.data.email };
  } catch (error) {
    console.error("patient access failed:", error instanceof Error ? error.name : "unknown error");
    return { status: "anonymous" };
  }
}
