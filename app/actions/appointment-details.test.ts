import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  loadAppointmentChoices: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/app/danas/load-appointment-choices", () => ({
  loadAppointmentChoices: mocks.loadAppointmentChoices,
}));

import { loadAppointmentDetails } from "./appointment-details";

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistId = "22222222-2222-4222-8222-222222222222";
const otherDentistId = "77777777-7777-4777-8777-777777777777";
const patientId = "33333333-3333-4333-8333-333333333333";
const typeId = "44444444-4444-4444-8444-444444444444";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const receptionUserId = "10000000-0000-4000-8000-000000000003";
const dentistUserId = "10000000-0000-4000-8000-000000000002";
const otherDentistUserId = "10000000-0000-4000-8000-000000000005";
const ownerUserId = "10000000-0000-4000-8000-000000000004";
const DAY = "2026-06-08";

const choices = {
  dentists: [{ id: dentistId, label: "Mina Minić" }],
  patients: [{ id: patientId, label: "Ana Anić", dateOfBirth: "1990-01-01", hasContact: false }],
  types: [{ id: typeId, label: "Pregled" }],
  slotMinutes: 15 as const,
};

type Row = Record<string, unknown>;

function createMemory() {
  const tables: Record<string, Row[]> = {
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
        note: null,
        cancellation_note: null,
      },
    ],
    patients: [
      {
        id: patientId,
        clinic_id: clinicId,
        slug: "ana-anic",
        first_name: "Ana",
        last_name: "Anić",
      },
    ],
    clinic_members: [
      {
        id: dentistId,
        clinic_id: clinicId,
        user_id: dentistUserId,
        first_name: "Mina",
        last_name: "Minić",
      },
      {
        id: otherDentistId,
        clinic_id: clinicId,
        user_id: otherDentistUserId,
        first_name: "Pera",
        last_name: "Perić",
      },
    ],
    appointment_types: [
      {
        id: typeId,
        clinic_id: clinicId,
        name: "Pregled",
      },
    ],
  };

  function from(table: string) {
    if (!(table in tables)) throw new Error(`unexpected table ${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    const matched = () => tables[table].filter((row) => filters.every((filter) => filter(row)));
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      maybeSingle() {
        const rows = matched();
        return Promise.resolve({ data: rows[0] ? { ...rows[0] } : null, error: null });
      },
    };
    return builder;
  }

  return { from };
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.loadAppointmentChoices.mockReset();
  mocks.createClient.mockResolvedValue(createMemory());
  mocks.loadAppointmentChoices.mockResolvedValue(choices);
  mocks.requireMember.mockResolvedValue({
    userId: ownerUserId,
    clinicId,
    role: "owner",
  });
});

describe("loadAppointmentDetails canComplete", () => {
  it("allows the owner to complete", async () => {
    const result = await loadAppointmentDetails(appointmentId);

    expect(result?.canComplete).toBe(true);
    expect(result?.role).toBe("owner");
    expect(result?.appointment.endsAt).toBe(parseBelgradeLocal(`${DAY}T10:30`).toISOString());
  });

  it("allows the appointment dentist to complete", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: dentistUserId,
      clinicId,
      role: "dentist",
    });

    const result = await loadAppointmentDetails(appointmentId);

    expect(result?.canComplete).toBe(true);
    expect(result?.role).toBe("dentist");
  });

  it("rejects a dentist who does not own the appointment", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: otherDentistUserId,
      clinicId,
      role: "dentist",
    });

    const result = await loadAppointmentDetails(appointmentId);

    expect(result?.canComplete).toBe(false);
    expect(result?.role).toBe("dentist");
  });

  it("hides complete for reception", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: receptionUserId,
      clinicId,
      role: "reception",
    });

    const result = await loadAppointmentDetails(appointmentId);

    expect(result?.canComplete).toBe(false);
    expect(result?.role).toBe("reception");
  });
});
