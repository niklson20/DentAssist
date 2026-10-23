import { z } from "zod";

import { ALERT_CODES } from "@/lib/labels";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { ChartHeaderAlert, ChartHeaderPatient } from "./chart-header";
import { CHILD_SLUG } from "./schema";

export type ChildChartMemberRole = "owner" | "dentist" | "reception";

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
      patient: ChartHeaderPatient & { slug: string };
      alerts: ChartHeaderAlert[] | null;
      connect: ChildChartConnect;
    };

const contactEmail = z.email();

const alertCode = z.enum(ALERT_CODES);

export async function loadChildChart(
  clinicId: string,
  slug: string,
  role: ChildChartMemberRole,
): Promise<ChildChartLoad> {
  const safeSlug = slug.trim().toLowerCase();
  if (!CHILD_SLUG.test(safeSlug)) {
    return { status: "missing" };
  }

  const clinical = role === "owner" || role === "dentist";

  try {
    const supabase = await createSupabaseServerClient();
    const patientTable = clinical ? "patients" : "patients_for_reception";
    const patientResult = await supabase
      .from(patientTable)
      .select(
        "id, slug, first_name, last_name, email, date_of_birth, merged_into_id, phone, sex, address, note",
      )
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

    let jmbg: string | null = null;
    let alerts: ChartHeaderAlert[] | null = null;

    if (clinical) {
      const jmbgResult = await supabase.rpc("patient_jmbg", { target_patient_id: patient.id });
      if (jmbgResult.error) {
        console.error("load_child_chart jmbg rejected:", jmbgResult.error.code ?? "rejected");
        return { status: "unavailable" };
      }
      jmbg = typeof jmbgResult.data === "string" && jmbgResult.data.trim() ? jmbgResult.data.trim() : null;

      const alertsResult = await supabase
        .from("patient_alerts")
        .select("code, note")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patient.id);

      if (alertsResult.error) {
        console.error("load_child_chart alerts rejected:", alertsResult.error.code ?? "rejected");
        return { status: "unavailable" };
      }
      alerts = chartAlerts(alertsResult.data);
    }

    return {
      status: "ready",
      patient: {
        slug: patient.slug,
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth,
        sex: patient.sex,
        address: patient.address,
        note: patient.note,
        jmbg,
      },
      alerts,
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
  phone: string | null;
  sex: "male" | "female" | null;
  address: string | null;
  note: string | null;
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
  const phone = typeof record.phone === "string" && record.phone.trim() ? record.phone.trim() : null;
  const sex = record.sex === "male" || record.sex === "female" ? record.sex : null;
  const address = typeof record.address === "string" && record.address.trim() ? record.address.trim() : null;
  const note = typeof record.note === "string" && record.note.trim() ? record.note.trim() : null;
  return {
    id: record.id,
    slug: record.slug,
    firstName,
    lastName,
    email,
    dateOfBirth,
    phone,
    sex,
    address,
    note,
    merged: record.merged_into_id != null,
  };
}

function chartAlerts(rows: unknown): ChartHeaderAlert[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  const alerts: ChartHeaderAlert[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const record = row as Record<string, unknown>;
    if (typeof record.note !== "string") {
      continue;
    }
    const note = record.note.trim();
    if (!note) {
      continue;
    }
    const parsed = alertCode.safeParse(record.code);
    if (!parsed.success) {
      continue;
    }
    alerts.push({ code: parsed.data, note });
  }
  return alerts;
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
