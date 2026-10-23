import { isIsoDate } from "@/lib/calendar-dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BOOKING_UNAVAILABLE } from "./schema";

export type SelfBookingProfile = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  dateOfBirth: string | null;
};

export type SelfBookingLoad =
  | { status: "ready"; profile: SelfBookingProfile; selfLinked: boolean }
  | { status: "unavailable"; message: typeof BOOKING_UNAVAILABLE };

export async function loadSelfBooking(accountId: string, slug: string): Promise<SelfBookingLoad> {
  try {
    const supabase = await createSupabaseServerClient();
    const [account, link] = await Promise.all([
      supabase
        .from("patient_accounts")
        .select("first_name, last_name, phone, email, date_of_birth")
        .eq("id", accountId)
        .maybeSingle(),
      supabase.rpc("self_chart_linked", { slug }),
    ]);

    if (account.error) {
      console.error("self_booking_account rejected:", account.error.code ?? "rejected");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }
    if (link.error || typeof link.data !== "boolean") {
      console.error("self_chart_linked rejected:", link.error?.code ?? "rejected");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }

    const profile = profileFrom(account.data);
    if (!profile) {
      console.error("self_booking_account rejected: invalid");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }

    return { status: "ready", profile, selfLinked: link.data };
  } catch (error) {
    console.error("self_booking_account failed:", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable", message: BOOKING_UNAVAILABLE };
  }
}

export function profileFrom(row: unknown): SelfBookingProfile | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  if (
    typeof record.first_name !== "string" ||
    typeof record.last_name !== "string" ||
    typeof record.email !== "string"
  ) {
    return null;
  }
  const firstName = record.first_name.trim();
  const lastName = record.last_name.trim();
  const email = record.email.trim();
  if (!firstName || !lastName || !email) {
    return null;
  }

  let dateOfBirth: string | null = null;
  if (record.date_of_birth != null) {
    if (typeof record.date_of_birth !== "string" || !isIsoDate(record.date_of_birth)) {
      return null;
    }
    dateOfBirth = record.date_of_birth;
  }

  const phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;
  return { firstName, lastName, phone, email, dateOfBirth };
}
