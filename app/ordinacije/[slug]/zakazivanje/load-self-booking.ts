import { isIsoDate } from "@/lib/calendar-dates";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { childrenFrom } from "../deca/load-children";
import { BOOKING_UNAVAILABLE, type BookingChild } from "./schema";

export type SelfBookingProfile = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  dateOfBirth: string | null;
};

export type SelfBookingLoad =
  | { status: "ready"; profile: SelfBookingProfile; selfLinked: boolean; children: BookingChild[] }
  | { status: "unavailable"; message: typeof BOOKING_UNAVAILABLE };

const DEPENDENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadSelfBooking(accountId: string, slug: string): Promise<SelfBookingLoad> {
  try {
    const supabase = await createSupabaseServerClient();
    const [account, link, dependents, linked] = await Promise.all([
      supabase
        .from("patient_accounts")
        .select("first_name, last_name, phone, email, date_of_birth")
        .eq("id", accountId)
        .maybeSingle(),
      supabase.rpc("self_chart_linked", { slug }),
      supabase
        .from("patient_dependents")
        .select("id, first_name, last_name, date_of_birth, relationship")
        .eq("account_id", accountId),
      supabase.rpc("linked_child_ids", { slug }),
    ]);

    if (account.error) {
      console.error("self_booking_account rejected:", account.error.code ?? "rejected");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }
    if (link.error || typeof link.data !== "boolean") {
      console.error("self_chart_linked rejected:", link.error?.code ?? "rejected");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }
    if (dependents.error || !Array.isArray(dependents.data)) {
      console.error("self_booking_children rejected:", dependents.error?.code ?? "rejected");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }
    const linkedIds = linked.error ? null : linkedIdsFrom(linked.data);
    if (!linkedIds) {
      console.error("linked_child_ids rejected:", linked.error?.code ?? "rejected");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }

    const profile = profileFrom(account.data);
    if (!profile) {
      console.error("self_booking_account rejected: invalid");
      return { status: "unavailable", message: BOOKING_UNAVAILABLE };
    }

    return {
      status: "ready",
      profile,
      selfLinked: link.data,
      children: bookingChildrenFrom(dependents.data, linkedIds),
    };
  } catch (error) {
    console.error("self_booking_account failed:", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable", message: BOOKING_UNAVAILABLE };
  }
}

export function linkedIdsFrom(data: unknown): Set<string> | null {
  if (!Array.isArray(data)) {
    return null;
  }
  const ids = new Set<string>();
  for (const item of data) {
    if (typeof item !== "string" || !DEPENDENT_ID.test(item)) {
      return null;
    }
    ids.add(item.toLowerCase());
  }
  return ids;
}

/** Account children only. A chart link in this clinic sets `linked`. Email is not copied. */
export function bookingChildrenFrom(rows: unknown, linkedIds: Set<string>): BookingChild[] {
  const children: BookingChild[] = [];
  for (const child of childrenFrom(rows)) {
    if (!DEPENDENT_ID.test(child.id) || !isIsoDate(child.dateOfBirth)) {
      continue;
    }
    const id = child.id.toLowerCase();
    children.push({
      id,
      firstName: child.firstName,
      lastName: child.lastName,
      dateOfBirth: child.dateOfBirth,
      relationship: child.relationship,
      linked: linkedIds.has(id),
    });
  }
  return children;
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
