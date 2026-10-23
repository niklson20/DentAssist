import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatBelgradeDate, parseBelgradeLocal } from "@/lib/calendar-dates";

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

import { createAppointment, createBlock } from "./appointments";

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const typeId = "44444444-4444-4444-8444-444444444444";
const ADULT = "1990-01-01";
const DAY = "2026-06-08";

type Row = Record<string, unknown>;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function blockForm(overrides: Record<string, string> = {}): FormData {
  return form({
    stomatolog: dentistId,
    datum: DAY,
    pocetak: "10:00",
    kraj: "10:30",
    razlog: "Sastanak",
    ...overrides,
  });
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

function memory(input: { dateOfBirth: string; unavailable?: boolean }) {
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
    patient_contacts: [],
    appointment_types: [{ id: typeId, clinic_id: clinicId, active: true }],
    appointments: [],
    blocked_periods: [],
  });
}

function publicStartRemoved(block: Row, start: Date, durationMinutes: number): boolean {
  if (
    block.clinic_id !== clinicId ||
    block.clinic_member_id !== dentistId ||
    typeof block.starts_at !== "string" ||
    typeof block.ends_at !== "string"
  ) {
    return false;
  }
  const startsAt = new Date(block.starts_at);
  const endsAt = new Date(block.ends_at);
  const slotEnd = new Date(start.getTime() + durationMinutes * 60_000);
  return endsAt > startsAt && startsAt < slotEnd && start < endsAt;
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

describe("createBlock", () => {
  it("hides the public start on 2026-06-08 and still lets staff book over the block", async () => {
    expect(formatBelgradeDate(new Date())).toBe(DAY);
    const supabase = memory({ dateOfBirth: ADULT });
    mocks.createClient.mockResolvedValue(supabase);

    const blocked = await createBlock(null, blockForm());
    const block = supabase.inserts.find((item) => item.table === "blocked_periods")?.row;

    expect(blocked).toEqual({ ok: true, data: { id: block?.id } });
    expect(block).toMatchObject({
      clinic_id: clinicId,
      clinic_member_id: dentistId,
      starts_at: parseBelgradeLocal(`${DAY}T10:00`).toISOString(),
      ends_at: parseBelgradeLocal(`${DAY}T10:30`).toISOString(),
      reason: "Sastanak",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");

    const durationMinutes = 30;
    const starts = ["09:00", "10:00", "11:00"].map((time) => parseBelgradeLocal(`${DAY}T${time}`));
    const visible = starts.filter((start) => !publicStartRemoved(block ?? {}, start, durationMinutes));
    expect(visible.map((start) => start.toISOString())).toEqual([
      parseBelgradeLocal(`${DAY}T09:00`).toISOString(),
      parseBelgradeLocal(`${DAY}T11:00`).toISOString(),
    ]);

    const saved = await createAppointment(null, appointmentForm());
    const appointment = supabase.inserts.find((item) => item.table === "appointments");
    expect(saved).toEqual({ ok: true, data: { id: appointment?.row.id } });
    expect(appointment?.row).toMatchObject({
      clinic_id: clinicId,
      dentist_id: dentistId,
      starts_at: parseBelgradeLocal(`${DAY}T10:00`).toISOString(),
      ends_at: parseBelgradeLocal(`${DAY}T10:30`).toISOString(),
      status: "scheduled",
      source: "staff",
    });

    const unavailable = memory({ dateOfBirth: ADULT, unavailable: true });
    mocks.createClient.mockResolvedValue(unavailable);
    const denied = await createAppointment(null, appointmentForm());
    expect(denied).toEqual({ ok: false, error: "Stomatolog je nedostupan." });
    expect(unavailable.inserts).toEqual([]);
  });
});
