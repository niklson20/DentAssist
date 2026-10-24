"use server";

import { crc32 as zlibCrc32 } from "node:zlib";

import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UNAVAILABLE = "Izvoz trenutno nije moguć. Pokušajte ponovo.";
const OWNER_ONLY = "Izvoz nije dostupan.";

const ownerSessionSchema = z.object({
  userId: z.string().uuid(),
  clinicId: z.string().uuid(),
  role: z.literal("owner"),
});

const ownedRowSchema = z.looseObject({
  clinic_id: z.string().uuid(),
});

const DATASETS = [
  {
    fileName: "patients.csv",
    table: "patients",
    columns: [
      "id",
      "clinic_id",
      "first_name",
      "last_name",
      "slug",
      "email",
      "email_declined",
      "phone",
      "date_of_birth",
      "sex",
      "address",
      "note",
      "merged_into_id",
      "created_at",
      "updated_at",
    ],
  },
  {
    fileName: "contacts.csv",
    table: "patient_contacts",
    columns: [
      "id",
      "patient_id",
      "clinic_id",
      "relationship",
      "first_name",
      "last_name",
      "phone",
      "email",
      "confirmed_at",
    ],
  },
  {
    fileName: "appointments.csv",
    table: "appointments",
    columns: [
      "id",
      "clinic_id",
      "dentist_id",
      "patient_id",
      "booking_request_id",
      "starts_at",
      "ends_at",
      "appointment_type_id",
      "status",
      "source",
      "note",
      "cancelled_by",
      "cancellation_note",
      "patient_reschedule_count",
      "confirmed_at",
      "confirmed_by",
      "created_at",
      "updated_at",
    ],
  },
  {
    fileName: "records.csv",
    table: "visits",
    columns: [
      "id",
      "appointment_id",
      "clinic_id",
      "patient_id",
      "procedure_description",
      "recommendations",
      "treatment_plan",
      "internal_notes",
      "recorded_at",
    ],
  },
  {
    fileName: "anamnesis.csv",
    table: "patient_anamnesis",
    columns: ["patient_id", "clinic_id", "chronic_conditions", "medications", "allergies", "pregnancy"],
  },
  {
    fileName: "chart.csv",
    table: "tooth_states",
    columns: ["id", "patient_id", "clinic_id", "fdi_code", "status", "surfaces"],
  },
  {
    fileName: "chart-history.csv",
    table: "tooth_state_changes",
    columns: [
      "id",
      "tooth_state_id",
      "clinic_id",
      "old_status",
      "new_status",
      "old_surfaces",
      "new_surfaces",
      "visit_id",
      "changed_by",
      "changed_at",
    ],
  },
] as const;

type ExportArchive = {
  fileName: string;
  zipBase64: string;
};

export async function exportClinic(): Promise<ActionResult<ExportArchive>> {
  const member = await requireOwner();
  const session = ownerSessionSchema.safeParse(member);
  if (!session.success) {
    return fail(OWNER_ONLY);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const files: { name: string; text: string }[] = [];

    for (const dataset of DATASETS) {
      const result = await supabase
        .from(dataset.table)
        .select(dataset.columns.join(", "))
        .eq("clinic_id", session.data.clinicId);
      if (result.error) {
        console.error("clinic_export rejected:", result.error.code ?? "rejected");
        return fail(UNAVAILABLE);
      }

      const rows = ownedRows(result.data, session.data.clinicId);
      if (!rows) {
        console.error("clinic_export rejected:", "rows");
        return fail(UNAVAILABLE);
      }
      files.push({ name: dataset.fileName, text: toCsv(dataset.columns, rows) });
    }

    return ok({
      fileName: "clinic-export.zip",
      zipBase64: zipStore(files).toString("base64"),
    });
  } catch (error) {
    console.error("clinic_export failed:", error instanceof Error ? error.name : "unknown");
    return fail(UNAVAILABLE);
  }
}

function ownedRows(data: unknown, clinicId: string): Record<string, unknown>[] | null {
  if (!Array.isArray(data)) return null;

  const rows: Record<string, unknown>[] = [];
  for (const item of data) {
    const parsed = ownedRowSchema.safeParse(item);
    if (!parsed.success || parsed.data.clinic_id !== clinicId) continue;
    rows.push(recordFrom(parsed.data));
  }
  return rows;
}

function recordFrom(row: { clinic_id: string }): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    record[key] = value;
  }
  return record;
}

function toCsv(columns: readonly string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function zipStore(files: { name: string; text: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const time = 0;
  const date = ((2026 - 1980) << 9) | (10 << 5) | 24;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const body = Buffer.from(file.text, "utf8");
    const crc = zlibCrc32(body) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}
