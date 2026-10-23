import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { setAppointmentStatus } from "./appointments";

const clinicId = "11111111-1111-4111-8111-111111111111";
const dentistId = "22222222-2222-4222-8222-222222222222";
const otherDentistId = "77777777-7777-4777-8777-777777777777";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const receptionUserId = "10000000-0000-4000-8000-000000000003";
const dentistUserId = "10000000-0000-4000-8000-000000000002";
const otherDentistUserId = "10000000-0000-4000-8000-000000000005";
const ownerUserId = "10000000-0000-4000-8000-000000000004";

type Row = Record<string, unknown>;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function statusForm(overrides: Record<string, string> = {}): FormData {
  return form({
    termin: appointmentId,
    status: "cancelled",
    ...overrides,
  });
}

function createMemory(members: Row[] = []) {
  const appointments: Row[] = [
    {
      id: appointmentId,
      clinic_id: clinicId,
      dentist_id: dentistId,
      status: "scheduled",
      cancellation_note: null,
      cancelled_by: null,
    },
  ];
  const clinicMembers = members.map((row) => ({ ...row }));
  const updates: Row[] = [];

  function from(table: string) {
    if (table !== "appointments" && table !== "clinic_members") {
      throw new Error(`unexpected table ${table}`);
    }
    const source = table === "appointments" ? appointments : clinicMembers;
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const matched = () => source.filter((row) => filters.every((filter) => filter(row)));
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      update(next: Row) {
        patch = next;
        updates.push(next);
        return builder;
      },
      maybeSingle() {
        const rows = matched();
        if (rows.length !== 1) return Promise.resolve({ data: null, error: null });
        if (patch) {
          Object.assign(rows[0], patch);
          return Promise.resolve({ data: { id: rows[0].id }, error: null });
        }
        return Promise.resolve({ data: { ...rows[0] }, error: null });
      },
    };
    return builder;
  }

  return { from, appointments, updates };
}

const dentistMembers: Row[] = [
  { id: dentistId, clinic_id: clinicId, user_id: dentistUserId, role: "dentist" },
  { id: otherDentistId, clinic_id: clinicId, user_id: otherDentistUserId, role: "dentist" },
];

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({
    userId: receptionUserId,
    clinicId,
    role: "reception",
  });
});

describe("setAppointmentStatus", () => {
  it("rejects cancelling a scheduled appointment without a message", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await setAppointmentStatus(null, statusForm());

    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { poruka: ["Otkaz zakazanog termina traži poruku."] },
    });
    expect(supabase.updates).toEqual([]);
    expect(supabase.appointments[0]).toMatchObject({ status: "scheduled", cancelled_by: null });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a whitespace cancellation message for a scheduled appointment", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await setAppointmentStatus(null, statusForm({ poruka: "   " }));

    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { poruka: ["Otkaz zakazanog termina traži poruku."] },
    });
    expect(supabase.updates).toEqual([]);
  });

  it("rejects a cancellation message longer than 300 characters", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await setAppointmentStatus(null, statusForm({ poruka: "a".repeat(301) }));

    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { poruka: ["Poruka može imati najviše 300 znakova."] },
    });
    expect(supabase.updates).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("cancels a scheduled appointment when reception sends a message", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);
    const poruka = "a".repeat(300);

    const result = await setAppointmentStatus(null, statusForm({ poruka }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.updates).toEqual([
      { status: "cancelled", cancelled_by: "staff", cancellation_note: poruka },
    ]);
    expect(supabase.appointments[0]).toMatchObject({
      status: "cancelled",
      cancelled_by: "staff",
      cancellation_note: poruka,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("marks no-show for reception", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await setAppointmentStatus(null, statusForm({ status: "no_show" }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.updates).toEqual([{ status: "no_show" }]);
    expect(supabase.appointments[0]).toMatchObject({
      status: "no_show",
      cancelled_by: null,
      cancellation_note: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("rejects completed for reception", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);

    const result = await setAppointmentStatus(null, statusForm({ status: "completed" }));

    expect(result).toEqual({
      ok: false,
      error: "Samo stomatolog tog termina i vlasnik mogu da označe termin završenim.",
    });
    expect(supabase.updates).toEqual([]);
  });

  it("rejects completed for a dentist who does not own the appointment", async () => {
    const supabase = createMemory(dentistMembers);
    mocks.createClient.mockResolvedValue(supabase);
    mocks.requireMember.mockResolvedValue({
      userId: otherDentistUserId,
      clinicId,
      role: "dentist",
    });

    const result = await setAppointmentStatus(null, statusForm({ status: "completed" }));

    expect(result).toEqual({
      ok: false,
      error: "Samo stomatolog tog termina i vlasnik mogu da označe termin završenim.",
    });
    expect(supabase.updates).toEqual([]);
  });

  it("marks completed for the appointment dentist", async () => {
    const supabase = createMemory(dentistMembers);
    mocks.createClient.mockResolvedValue(supabase);
    mocks.requireMember.mockResolvedValue({
      userId: dentistUserId,
      clinicId,
      role: "dentist",
    });

    const result = await setAppointmentStatus(null, statusForm({ status: "completed" }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.updates).toEqual([{ status: "completed" }]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("marks completed for the owner", async () => {
    const supabase = createMemory();
    mocks.createClient.mockResolvedValue(supabase);
    mocks.requireMember.mockResolvedValue({
      userId: ownerUserId,
      clinicId,
      role: "owner",
    });

    const result = await setAppointmentStatus(null, statusForm({ status: "completed" }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(supabase.updates).toEqual([{ status: "completed" }]);
  });
});
