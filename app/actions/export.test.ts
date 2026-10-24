import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { exportClinic } from "./export";

const clinicId = "11111111-1111-4111-8111-111111111111";
const otherClinicId = "22222222-2222-4222-8222-222222222222";
const userId = "10000000-0000-4000-8000-000000000002";
const patientId = "44444444-4444-4444-8444-444444444444";
const otherPatientId = "55555555-5555-4555-8555-555555555555";

const queried: string[] = [];
const clinicFilters: string[] = [];

const tables: Record<string, Record<string, unknown>[]> = {
  patients: [
    { id: patientId, clinic_id: clinicId, first_name: "Ana", last_name: "Anic" },
    { id: otherPatientId, clinic_id: otherClinicId, first_name: "Tudja", last_name: "Tudjic" },
  ],
  patient_contacts: [
    { id: patientId, patient_id: patientId, clinic_id: clinicId, first_name: "Mila", relationship: "mother" },
    { id: otherPatientId, patient_id: otherPatientId, clinic_id: otherClinicId, first_name: "Stran", relationship: "father" },
  ],
  appointments: [
    { id: patientId, clinic_id: clinicId, patient_id: patientId, note: "Kontrola" },
    { id: otherPatientId, clinic_id: otherClinicId, patient_id: otherPatientId, note: "Tudji termin" },
  ],
  visits: [
    { id: patientId, clinic_id: clinicId, patient_id: patientId, procedure_description: "Plomba" },
    { id: otherPatientId, clinic_id: otherClinicId, patient_id: otherPatientId, procedure_description: "Tudji zapis" },
  ],
  patient_anamnesis: [
    { patient_id: patientId, clinic_id: clinicId, allergies: "Penicilin" },
    { patient_id: otherPatientId, clinic_id: otherClinicId, allergies: "Tudja anamneza" },
  ],
  tooth_states: [
    { id: patientId, patient_id: patientId, clinic_id: clinicId, fdi_code: "16", status: "caries", surfaces: ["occlusal"] },
    { id: otherPatientId, patient_id: otherPatientId, clinic_id: otherClinicId, fdi_code: "21", status: "missing" },
  ],
  tooth_state_changes: [
    { id: patientId, tooth_state_id: patientId, clinic_id: clinicId, new_status: "filling" },
    { id: otherPatientId, tooth_state_id: otherPatientId, clinic_id: otherClinicId, new_status: "crown" },
  ],
  patient_files: [
    {
      id: patientId,
      patient_id: patientId,
      clinic_id: clinicId,
      category: "xray",
      mime_type: "image/jpeg",
      title: "Snimak-RTG",
      storage_path: `${clinicId}/${patientId}/${patientId}.jpg`,
    },
    {
      id: otherPatientId,
      patient_id: patientId,
      clinic_id: clinicId,
      category: "report",
      mime_type: "application/pdf",
      title: "Nalaz",
      storage_path: `${clinicId}/${patientId}/${otherPatientId}.pdf`,
    },
  ],
};

beforeEach(() => {
  queried.length = 0;
  clinicFilters.length = 0;
  mocks.requireOwner.mockReset();
  mocks.createClient.mockReset();
  mocks.requireOwner.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.createClient.mockImplementation(async () => ({
    from(table: string) {
      queried.push(table);
      return {
        select() {
          return {
            eq(column: string, value: string) {
              if (column === "clinic_id") clinicFilters.push(value);
              return Promise.resolve({ data: tables[table] ?? [], error: null });
            },
          };
        },
      };
    },
  }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("exportClinic", () => {
  it.each(["dentist", "reception"] as const)("does not give a %s a zip", async (role) => {
    mocks.requireOwner.mockResolvedValue({ userId, clinicId, role });

    const result = await exportClinic();

    expect(result).toEqual({ ok: false, error: "Izvoz nije dostupan." });
    expect(mocks.requireOwner).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(queried).toEqual([]);
  });

  it("packs the owner clinic into csv files and leaves out files and other clinics", async () => {
    const result = await exportClinic();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.fileName).toBe("clinic-export.zip");
    expect(queried).toEqual([
      "patients",
      "patient_contacts",
      "appointments",
      "visits",
      "patient_anamnesis",
      "tooth_states",
      "tooth_state_changes",
    ]);
    expect(clinicFilters).toEqual([clinicId, clinicId, clinicId, clinicId, clinicId, clinicId, clinicId]);
    expect(queried).not.toContain("patient_files");

    const zip = Buffer.from(result.data.zipBase64, "base64");
    const entries = zipEntries(zip);
    expect([...entries.keys()]).toEqual([
      "patients.csv",
      "contacts.csv",
      "appointments.csv",
      "records.csv",
      "anamnesis.csv",
      "chart.csv",
      "chart-history.csv",
    ]);

    const combined = [...entries.values()].map((body) => body.toString("utf8")).join("\n");
    expect(combined).toContain(clinicId);
    expect(combined).toContain("Ana");
    expect(combined).toContain("Mila");
    expect(combined).toContain("Kontrola");
    expect(combined).toContain("Plomba");
    expect(combined).toContain("Penicilin");
    expect(combined).toContain("caries");
    expect(combined).toContain("filling");
    expect(combined).not.toContain(otherClinicId);
    expect(combined).not.toContain("Tudja");
    expect(combined).not.toContain("Tudji");
    expect(combined).not.toContain("Snimak-RTG");
    expect(combined).not.toContain("xray");
    expect(combined).not.toContain("application/pdf");
    expect(combined).not.toContain("image/jpeg");
    expect(combined).not.toContain(".pdf");
    expect(combined).not.toContain(".jpg");

    for (const [name, body] of entries) {
      expect(name.endsWith(".csv")).toBe(true);
      const lines = body.toString("utf8").trim().split(/\r?\n/).slice(1).filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toContain(clinicId);
        expect(line).not.toContain(otherClinicId);
      }
    }
  });
});

function zipEntries(bytes: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) break;
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const dataStart = nameStart + nameLength + extraLength;
    if (method !== 0) {
      throw new Error(`compressed entry ${name}`);
    }
    entries.set(name, bytes.subarray(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  return entries;
}
