import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CHILD_SLUG } from "./schema";

export type ParentContactOption = {
  id: string;
  label: string;
};

export type ChildChartConnect =
  | { kind: "hidden" }
  | { kind: "needsBirthDate" }
  | { kind: "ready"; contacts: ParentContactOption[] };

export type ChildChartLoad =
  | { status: "missing" }
  | { status: "unavailable" }
  | {
      status: "ready";
      patient: { slug: string; firstName: string; lastName: string };
      connect: ChildChartConnect;
    };

const contactEmail = z.email();

export async function loadChildChart(clinicId: string, slug: string): Promise<ChildChartLoad> {
  const safeSlug = slug.trim().toLowerCase();
  if (!CHILD_SLUG.test(safeSlug)) {
    return { status: "missing" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const patientResult = await supabase
      .from("patients")
      .select("id, slug, first_name, last_name, email, date_of_birth, merged_into_id")
      .eq("clinic_id", clinicId)
      .eq("slug", safeSlug)
      .maybeSingle();

    if (patientResult.error) {
      console.error("load_child_chart rejected:", patientResult.error.code ?? "rejected");
      return { status: "unavailable" };
    }
    const patient = patientFrom(patientResult.data);
    if (!patient) {
      return { status: "missing" };
    }

    const contactResult = await supabase
      .from("patient_contacts")
      .select("id, first_name, last_name, email")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patient.id);

    if (contactResult.error) {
      console.error("load_child_chart contacts rejected:", contactResult.error.code ?? "rejected");
      return { status: "unavailable" };
    }

    return {
      status: "ready",
      patient: {
        slug: patient.slug,
        firstName: patient.firstName,
        lastName: patient.lastName,
      },
      connect: connectState(patient, contactOptions(contactResult.data)),
    };
  } catch (error) {
    console.error("load_child_chart failed:", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable" };
  }
}

type ChartRow = {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  email: string | null;
  dateOfBirth: string | null;
  merged: boolean;
};

function patientFrom(row: unknown): ChartRow | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.slug !== "string" ||
    typeof record.first_name !== "string" ||
    typeof record.last_name !== "string"
  ) {
    return null;
  }
  const firstName = record.first_name.trim();
  const lastName = record.last_name.trim();
  if (!firstName || !lastName) {
    return null;
  }
  const email = typeof record.email === "string" && record.email.trim() ? record.email.trim() : null;
  const dateOfBirth = typeof record.date_of_birth === "string" ? record.date_of_birth : null;
  return {
    id: record.id,
    slug: record.slug,
    firstName,
    lastName,
    email,
    dateOfBirth,
    merged: record.merged_into_id != null,
  };
}

function contactOptions(rows: unknown): ParentContactOption[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const contacts: ParentContactOption[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const record = row as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.first_name !== "string" ||
      typeof record.last_name !== "string" ||
      typeof record.email !== "string"
    ) {
      continue;
    }
    const email = record.email.trim().toLowerCase();
    const firstName = record.first_name.trim();
    const lastName = record.last_name.trim();
    if (!firstName || !lastName || !contactEmail.safeParse(email).success) {
      continue;
    }
    contacts.push({
      id: record.id,
      label: `${firstName} ${lastName} · ${email}`,
    });
  }
  return contacts.sort((left, right) => left.label.localeCompare(right.label, "sr"));
}

function connectState(patient: ChartRow, contacts: ParentContactOption[]): ChildChartConnect {
  if (patient.merged || patient.email || contacts.length === 0) {
    return { kind: "hidden" };
  }
  if (!patient.dateOfBirth) {
    return { kind: "needsBirthDate" };
  }
  return { kind: "ready", contacts };
}
