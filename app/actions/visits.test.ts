import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";

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

import { saveVisit, updateVisit } from "./visits";

const clinicId = "11111111-1111-4111-8111-111111111111";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const visitId = "66666666-6666-4666-8666-666666666666";
const userId = "10000000-0000-4000-8000-000000000002";
const DAY = "2026-06-08";
const appointmentEnd = parseBelgradeLocal(`${DAY}T10:30`);

type VisitRow = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  procedure_description: string | null;
  recommendations: string | null;
  treatment_plan: string | null;
  internal_notes: string | null;
};

type AppointmentRow = {
  id: string;
  clinic_id: string;
  status: string;
  ends_at: string;
};

const state: {
  appointments: AppointmentRow[];
  visits: VisitRow[];
  rpcCalls: number;
} = {
  appointments: [],
  visits: [],
  rpcCalls: 0,
};

function noteForm(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values = {
    termin: appointmentId,
    opis: "",
    preporuke: "",
    plan: "",
    beleske: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function seedVisit(procedure = "Vađenje"): void {
  state.visits = [
    {
      id: visitId,
      clinic_id: clinicId,
      appointment_id: appointmentId,
      procedure_description: procedure,
      recommendations: null,
      treatment_plan: null,
      internal_notes: null,
    },
  ];
}

function createMemory() {
  function from(table: string) {
    const filters = new Map<string, unknown>();
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.set(column, value);
        return builder;
      },
      maybeSingle() {
        if (table === "appointments") {
          const row = state.appointments.find(
            (item) => item.id === filters.get("id") && item.clinic_id === filters.get("clinic_id"),
          );
          return Promise.resolve({ data: row ? { ...row } : null, error: null });
        }
        if (table === "visits") {
          const row = state.visits.find(
            (item) =>
              item.appointment_id === filters.get("appointment_id") &&
              item.clinic_id === filters.get("clinic_id"),
          );
          return Promise.resolve({ data: row ? { id: row.id } : null, error: null });
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    return builder;
  }

  return {
    from,
    async rpc(fn: string, args: Record<string, string | null>) {
      if (fn !== "save_visit") throw new Error(`unexpected rpc ${fn}`);
      state.rpcCalls += 1;
      const appointmentIdArg = args.p_appointment_id;
      const existing = state.visits.find((row) => row.appointment_id === appointmentIdArg);
      if (existing) {
        existing.procedure_description = args.p_procedure_description;
        existing.recommendations = args.p_recommendations;
        existing.treatment_plan = args.p_treatment_plan;
        existing.internal_notes = args.p_internal_notes;
        return { data: existing.id, error: null };
      }
      const created: VisitRow = {
        id: visitId,
        clinic_id: clinicId,
        appointment_id: appointmentIdArg,
        procedure_description: args.p_procedure_description,
        recommendations: args.p_recommendations,
        treatment_plan: args.p_treatment_plan,
        internal_notes: args.p_internal_notes,
      };
      state.visits.push(created);
      return { data: visitId, error: null };
    },
  };
}

beforeEach(() => {
  state.appointments = [
    {
      id: appointmentId,
      clinic_id: clinicId,
      status: "completed",
      ends_at: appointmentEnd.toISOString(),
    },
  ];
  state.visits = [];
  state.rpcCalls = 0;
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.createClient.mockImplementation(async () => createMemory());
  vi.useFakeTimers();
  vi.setSystemTime(appointmentEnd);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("saveVisit", () => {
  it("accepts empty fields on 2026-06-08", async () => {
    const result = await saveVisit(null, noteForm());

    expect(DAY).toBe("2026-06-08");
    expect(result).toEqual({ ok: true, data: { id: visitId } });
    expect(state.visits).toEqual([
      {
        id: visitId,
        clinic_id: clinicId,
        appointment_id: appointmentId,
        procedure_description: null,
        recommendations: null,
        treatment_plan: null,
        internal_notes: null,
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
    expect(readFileSync(path.join(process.cwd(), "app/actions/visits.ts"), "utf8")).toContain(
      "isVisitLocked(",
    );
  });

  it("rejects a second note for the same appointment on 2026-06-08", async () => {
    const first = await saveVisit(null, noteForm());
    mocks.revalidatePath.mockClear();

    const second = await saveVisit(null, noteForm({ opis: "Kontrola" }));

    expect(first).toEqual({ ok: true, data: { id: visitId } });
    expect(second).toMatchObject({ ok: false, error: "Termin već ima zapis." });
    expect(state.visits).toHaveLength(1);
    expect(state.visits[0]?.procedure_description).toBeNull();
    expect(state.rpcCalls).toBe(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateVisit", () => {
  it("lets the owner edit before the deadline on 2026-06-08", async () => {
    seedVisit();

    const result = await updateVisit(null, noteForm({ opis: "Izmena" }));

    expect(result).toEqual({ ok: true, data: { id: visitId } });
    expect(state.visits[0]?.procedure_description).toBe("Izmena");
  });

  it("does not open the edit for the owner after the deadline on 2026-06-08", async () => {
    seedVisit();
    vi.setSystemTime(new Date(appointmentEnd.getTime() + 24 * 60 * 60 * 1000));

    const result = await updateVisit(null, noteForm({ opis: "Izmena" }));

    expect(mocks.requireMember).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: "Zapis je zaključan." });
    expect(state.visits[0]?.procedure_description).toBe("Vađenje");
    expect(state.rpcCalls).toBe(0);
  });
});
