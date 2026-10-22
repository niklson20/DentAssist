import { RELATIONSHIPS, type Relationship } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountChild = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  relationship: Relationship;
};

export type ChildrenLoad = { status: "ready"; children: AccountChild[] } | { status: "unavailable" };

export async function loadAccountChildren(accountId: string): Promise<ChildrenLoad> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("patient_dependents")
      .select("id, first_name, last_name, date_of_birth, relationship")
      .eq("account_id", accountId)
      .order("last_name")
      .order("first_name");

    if (error) {
      console.error("load_account_children rejected:", error.code ?? "rejected");
      return { status: "unavailable" };
    }

    return { status: "ready", children: childrenFrom(data) };
  } catch (error) {
    console.error("load_account_children failed:", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable" };
  }
}

export function childrenFrom(rows: unknown): AccountChild[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const children: AccountChild[] = [];
  for (const row of rows) {
    const child = childFrom(row);
    if (child) {
      children.push(child);
    }
  }
  return children.sort(
    (left, right) =>
      left.lastName.localeCompare(right.lastName, "sr") ||
      left.firstName.localeCompare(right.firstName, "sr"),
  );
}

function childFrom(row: unknown): AccountChild | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.first_name !== "string" ||
    typeof record.last_name !== "string" ||
    typeof record.date_of_birth !== "string" ||
    typeof record.relationship !== "string" ||
    !isRelationship(record.relationship)
  ) {
    return null;
  }
  const firstName = record.first_name.trim();
  const lastName = record.last_name.trim();
  if (!firstName || !lastName) {
    return null;
  }
  return {
    id: record.id,
    firstName,
    lastName,
    dateOfBirth: record.date_of_birth,
    relationship: record.relationship,
  };
}

function isRelationship(value: string): value is Relationship {
  return (RELATIONSHIPS as readonly string[]).includes(value);
}
