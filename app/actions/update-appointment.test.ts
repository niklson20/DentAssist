import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";
import { appointmentMovedMessage } from "@/lib/mail";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mail")>();
  return { ...actual, sendMail: mocks.sendMail };
});

import { updateAppointment } from "./appointments";

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistId = "22222222-2222-4222-8222-222222222222";
const otherDentistId = "77777777-7777-4777-8777-777777777777";
const patientId = "33333333-3333-4333-8333-333333333333";
const typeId = "44444444-4444-4444-8444-444444444444";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const DAY = "2026-06-08";

type Row = Record<string, unknown>;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function updateForm(overrides: Record<string, string> = {}): FormData {
  return form({
    termin: appointmentId,
    stomatolog: dentistId,
    pacijent: patientId,
    pocetak: `${DAY}T10:00`,
    trajanje: "30",
    tip: typeId,
    napomena: "",
    ...overrides,
  });
}

function createMemory() {
  const tables: Record<string, Row[]> = {
    clinics: [
      {
        id: clinicId,
        slot_minutes: 15,
        name: "Ordinacija Centar",
        address: "Knez Mihailova 1",
        phone: "011123456",
      },
    ],
    clinic_members: [
      {
        id: dentistId,
        clinic_id: clinicId,
        role: "dentist",
        sees_patients: true,
        unavailable: false,
        first_name: "Mina",
        last_name: "Minić",
      },
      {
        id: otherDentistId,
        clinic_id: clinicId,
        role: "dentist",
        sees_patients: true,
        unavailable: false,
        first_name: "Pera",
        last_name: "Perić",
      },
    ],
    patients: [
      {
        id: patientId,
        clinic_id: clinicId,
        date_of_birth: "1990-01-01",
        merged_into_id: null,
        email: "ana@example.com",
      },
    ],
    patient_contacts: [],
    appointment_types: [{ id: typeId, clinic_id: clinicId, active: true }],
    appointments: [
      {
        id: appointmentId,
        clinic_id: clinicId,
        dentist_id: dentistId,
        patient_id: patientId,
        appointment_type_id: typeId,
        starts_at: parseBelgradeLocal(`${DAY}T10:00`).toISOString(),
        ends_at: parseBelgradeLocal(`${DAY}T10:30`).toISOString(),
        status: "scheduled",
        source: "staff",
        note: null,
        patient_reschedule_count: 1,
      },
    ],
  };

  function from(table: string) {
    if (!(table in tables)) throw new Error(`unexpected table ${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    let cap = Number.POSITIVE_INFINITY;
    let patch: Row | null = null;
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
      update(next: Row) {
        patch = next;
        return builder;
      },
      maybeSingle() {
        const rows = matched();
        if (patch) {
          if (rows.length !== 1) return Promise.resolve({ data: null, error: null });
          Object.assign(rows[0], patch);
          return Promise.resolve({ data: { id: rows[0].id }, error: null });
        }
        return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve({ data: matched(), error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  return { from, appointments: tables.appointments };
}

function movedMail(dentistName: string, localStart: string) {
  return appointmentMovedMessage({
    to: "ana@example.com",
    clinicName: "Ordinacija Centar",
    startsAt: parseBelgradeLocal(localStart).toISOString(),
    dentistName,
    address: "Knez Mihailova 1",
    phone: "011123456",
  });
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.sendMail.mockReset();
  mocks.sendMail.mockResolvedValue(undefined);
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

describe("updateAppointment", () => {
  it("emails Termin je pomeren when the hour changes on 2026-06-08", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await updateAppointment(null, updateForm({ pocetak: `${DAY}T11:00` }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.appointments[0]).toMatchObject({
      dentist_id: dentistId,
      starts_at: parseBelgradeLocal(`${DAY}T11:00`).toISOString(),
      ends_at: parseBelgradeLocal(`${DAY}T11:30`).toISOString(),
      patient_reschedule_count: 1,
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(movedMail("Mina Minić", `${DAY}T11:00`));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("does not email when only the dentist changes on 2026-06-08", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await updateAppointment(null, updateForm({ stomatolog: otherDentistId }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.appointments[0]).toMatchObject({
      dentist_id: otherDentistId,
      starts_at: parseBelgradeLocal(`${DAY}T10:00`).toISOString(),
      patient_reschedule_count: 1,
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("emails Termin je pomeren when the hour and the dentist both change on 2026-06-08", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await updateAppointment(
      null,
      updateForm({ stomatolog: otherDentistId, pocetak: `${DAY}T11:00` }),
    );

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.appointments[0]).toMatchObject({
      dentist_id: otherDentistId,
      starts_at: parseBelgradeLocal(`${DAY}T11:00`).toISOString(),
      patient_reschedule_count: 1,
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(movedMail("Pera Perić", `${DAY}T11:00`));
  });
});
