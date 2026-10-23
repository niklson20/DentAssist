import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatBelgradeDate, hasTurned15, parseBelgradeLocal } from "@/lib/calendar-dates";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { createAppointment } from "./appointments";

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const typeId = "44444444-4444-4444-8444-444444444444";
const otherPatientId = "66666666-6666-4666-8666-666666666666";
const CHILD = "2012-03-01";
const ADULT = "1990-01-01";
const DAY = "2026-06-08";

type Row = Record<string, unknown>;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function appointmentForm(overrides: Record<string, string> = {}): FormData {
  return form({
    stomatolog: dentistId,
    pacijent: patientId,
    pocetak: `${DAY}T10:00`,
    trajanje: "30",
    tip: typeId,
    napomena: "",
    ...overrides,
  });
}

function createMemory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const inserts: { table: string; row: Row }[] = [];
  let sequence = 0;

  function from(table: string) {
    if (!(table in tables)) throw new Error(`unexpected table ${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    let cap = Number.POSITIVE_INFINITY;
    const matched = () => tables[table].filter((row) => filters.every((filter) => filter(row))).slice(0, cap);
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      lt(column: string, value: unknown) {
        filters.push((row) => String(row[column]) < String(value));
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push((row) => String(row[column]) > String(value));
        return builder;
      },
      limit(count: number) {
        cap = count;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: matched()[0] ?? null, error: null });
      },
      insert(row: Row) {
        sequence += 1;
        const id = `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
        const stored = { ...row, id };
        tables[table].push(stored);
        inserts.push({ table, row: stored });
        return {
          select() {
            return {
              single: () => Promise.resolve({ data: { id }, error: null }),
            };
          },
        };
      },
      then(
        resolve: (value: { data: Row[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: matched(), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return { from, inserts };
}

function memory(input: {
  dateOfBirth: string;
  unavailable?: boolean;
  contacts?: Row[];
  appointments?: Row[];
}) {
  return createMemory({
    clinics: [{ id: clinicId, slot_minutes: 15 }],
    clinic_members: [
      {
        id: dentistId,
        clinic_id: clinicId,
        role: "dentist",
        sees_patients: true,
        unavailable: input.unavailable ?? false,
      },
    ],
    patients: [
      {
        id: patientId,
        clinic_id: clinicId,
        date_of_birth: input.dateOfBirth,
        merged_into_id: null,
      },
    ],
    patient_contacts: input.contacts ?? [],
    appointment_types: [{ id: typeId, clinic_id: clinicId, active: true }],
    appointments: input.appointments ?? [],
  });
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId,
    role: "dentist",
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${DAY}T10:00:00.000Z`));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createAppointment", () => {
  it("rejects a patient under 15 without a contact on 2026-06-08", async () => {
    expect(formatBelgradeDate(new Date())).toBe(DAY);
    expect(hasTurned15(CHILD, DAY)).toBe(false);
    const supabase = memory({ dateOfBirth: CHILD });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(null, appointmentForm());

    expect(result).toEqual({
      ok: false,
      error: "Pacijent mlađi od 15 godina mora imati kontakt roditelja ili srodnika.",
      fieldErrors: expect.any(Object),
    });
    expect(supabase.inserts).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("saves an adult without a contact on 2026-06-08", async () => {
    expect(hasTurned15(ADULT, DAY)).toBe(true);
    const supabase = memory({ dateOfBirth: ADULT });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(null, appointmentForm({ napomena: "Kontrola" }));

    expect(result).toEqual({ ok: true, data: { id: supabase.inserts[0]?.row.id } });
    expect(supabase.inserts.map((item) => item.table)).toEqual(["appointments"]);
    expect(supabase.inserts[0]?.row).toMatchObject({
      clinic_id: clinicId,
      dentist_id: dentistId,
      patient_id: patientId,
      appointment_type_id: typeId,
      status: "scheduled",
      source: "staff",
      note: "Kontrola",
      starts_at: parseBelgradeLocal(`${DAY}T10:00`).toISOString(),
      ends_at: parseBelgradeLocal(`${DAY}T10:30`).toISOString(),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("saves a time outside working hours on 2026-06-08", async () => {
    const supabase = memory({ dateOfBirth: ADULT });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(
      null,
      appointmentForm({ pocetak: `${DAY}T20:00` }),
    );

    expect(result).toEqual({ ok: true, data: { id: supabase.inserts[0]?.row.id } });
    expect(supabase.inserts.map((item) => item.table)).toEqual(["appointments"]);
    expect(supabase.inserts[0]?.row).toMatchObject({
      starts_at: parseBelgradeLocal(`${DAY}T20:00`).toISOString(),
      ends_at: parseBelgradeLocal(`${DAY}T20:30`).toISOString(),
      status: "scheduled",
      source: "staff",
    });
  });

  it("rejects an unavailable dentist on 2026-06-08", async () => {
    const supabase = memory({ dateOfBirth: ADULT, unavailable: true });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(null, appointmentForm());

    expect(result).toEqual({ ok: false, error: "Stomatolog je nedostupan." });
    expect(supabase.inserts).toEqual([]);
  });

  it("rejects another appointment of that dentist on 2026-06-08", async () => {
    const supabase = memory({
      dateOfBirth: ADULT,
      appointments: [
        {
          clinic_id: clinicId,
          dentist_id: dentistId,
          patient_id: otherPatientId,
          starts_at: parseBelgradeLocal(`${DAY}T10:00`).toISOString(),
          ends_at: parseBelgradeLocal(`${DAY}T10:30`).toISOString(),
          status: "scheduled",
        },
      ],
    });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(null, appointmentForm({ pocetak: `${DAY}T10:15` }));

    expect(result).toEqual({ ok: false, error: "Stomatolog već ima termin u tom vremenu." });
    expect(supabase.inserts).toEqual([]);
  });

  it("rejects an earlier day than 2026-06-08", async () => {
    expect(formatBelgradeDate(new Date())).toBe(DAY);
    const supabase = memory({ dateOfBirth: ADULT });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(null, appointmentForm({ pocetak: "2026-06-07T10:00" }));

    expect(result).toEqual({
      ok: false,
      error: "Raniji dan ne može.",
      fieldErrors: { pocetak: ["Raniji dan ne može."] },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(supabase.inserts).toEqual([]);
  });

  it("saves a patient under 15 when the contact is sent", async () => {
    const supabase = memory({ dateOfBirth: CHILD });
    mocks.createClient.mockResolvedValue(supabase);

    const result = await createAppointment(
      null,
      appointmentForm({
        kontaktOdnos: "mother",
        kontaktIme: "Mila",
        kontaktPrezime: "Anić",
        kontaktTelefon: "064 123 4567",
      }),
    );

    expect(result.ok).toBe(true);
    expect(supabase.inserts.map((item) => item.table)).toEqual(["patient_contacts", "appointments"]);
    expect(supabase.inserts[0]?.row).toMatchObject({
      clinic_id: clinicId,
      patient_id: patientId,
      relationship: "mother",
      first_name: "Mila",
      last_name: "Anić",
      phone: "+381641234567",
      email: null,
    });
  });
});
