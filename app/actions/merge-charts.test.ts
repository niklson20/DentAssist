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

import { mergeCharts } from "./patients";

const clinicId = "11111111-1111-4111-8111-111111111111";
const targetId = "44444444-4444-4444-8444-444444444444";
const sourceId = "55555555-5555-4555-8555-555555555555";
const userId = "10000000-0000-4000-8000-000000000002";
const keptToothId = "99999999-9999-4999-8999-999999999999";
const sourceToothId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const movedToothId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

type PatientRow = {
  id: string;
  clinic_id: string;
  merged_into_id: string | null;
};

type OwnedRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
};

type AnamnesisRow = {
  patient_id: string;
  chronic_conditions: string;
};

type ToothRow = {
  id: string;
  clinic_id: string;
  patient_id: string;
  fdi_code: string;
  status: string;
};

type HistoryRow = {
  id: string;
  tooth_state_id: string;
  new_status: string;
};

type MergeArgs = {
  target_id: string;
  source_id: string;
};

const state: {
  patients: PatientRow[];
  appointments: OwnedRow[];
  visits: OwnedRow[];
  contacts: OwnedRow[];
  files: OwnedRow[];
  alerts: OwnedRow[];
  anamnesis: AnamnesisRow[];
  teeth: ToothRow[];
  history: HistoryRow[];
  calls: MergeArgs[];
} = {
  patients: [],
  appointments: [],
  visits: [],
  contacts: [],
  files: [],
  alerts: [],
  anamnesis: [],
  teeth: [],
  history: [],
  calls: [],
};

function mergeForm(): FormData {
  const data = new FormData();
  data.set("patientId", targetId);
  data.set("sourceId", sourceId);
  return data;
}

function chartsInSearch(): string[] {
  return state.patients.filter((row) => row.merged_into_id === null).map((row) => row.id);
}

function owned(id: string, patientId: string): OwnedRow {
  return { id, clinic_id: clinicId, patient_id: patientId };
}

function moveOwned(rows: OwnedRow[], fromId: string, toId: string): void {
  for (const row of rows) {
    if (row.patient_id === fromId) row.patient_id = toId;
  }
}

function applyMerge(args: MergeArgs): { data: null; error: { code: string } | null } {
  const target = state.patients.find((row) => row.id === args.target_id);
  const source = state.patients.find((row) => row.id === args.source_id);
  if (!target || !source || target.merged_into_id !== null || source.merged_into_id !== null) {
    return { data: null, error: { code: "P0001" } };
  }

  moveOwned(state.appointments, source.id, target.id);
  moveOwned(state.visits, source.id, target.id);
  moveOwned(state.contacts, source.id, target.id);
  moveOwned(state.files, source.id, target.id);
  moveOwned(state.alerts, source.id, target.id);

  if (state.anamnesis.some((row) => row.patient_id === target.id)) {
    state.anamnesis = state.anamnesis.filter((row) => row.patient_id !== source.id);
  } else {
    for (const row of state.anamnesis) {
      if (row.patient_id === source.id) row.patient_id = target.id;
    }
  }

  const sourceTeeth = state.teeth.filter((row) => row.patient_id === source.id);
  for (const tooth of sourceTeeth) {
    const current = state.teeth.find(
      (row) => row.patient_id === target.id && row.fdi_code === tooth.fdi_code,
    );
    if (!current) {
      tooth.patient_id = target.id;
      continue;
    }
    for (const change of state.history) {
      if (change.tooth_state_id === tooth.id) change.tooth_state_id = current.id;
    }
    state.history.push({
      id: `history-${tooth.id}`,
      tooth_state_id: current.id,
      new_status: tooth.status,
    });
    state.teeth = state.teeth.filter((row) => row.id !== tooth.id);
  }

  source.merged_into_id = target.id;
  return { data: null, error: null };
}

function createMemory() {
  return {
    from(table: string) {
      if (table !== "patients") throw new Error(`unexpected table ${table}`);
      const filters = new Map<string, unknown>();
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return builder;
        },
        is(column: string, value: unknown) {
          filters.set(`is:${column}`, value);
          return builder;
        },
        delete() {
          throw new Error("patients must not be deleted");
        },
        async maybeSingle() {
          const row = state.patients.find((item) => {
            if (item.clinic_id !== filters.get("clinic_id")) return false;
            if (item.id !== filters.get("id")) return false;
            if (filters.get("is:merged_into_id") === null && item.merged_into_id !== null) {
              return false;
            }
            return true;
          });
          return { data: row ? { id: row.id } : null, error: null };
        },
      };
      return builder;
    },
    async rpc(fn: string, args: MergeArgs) {
      if (fn !== "merge_patients") throw new Error(`unexpected rpc ${fn}`);
      state.calls.push(args);
      return applyMerge(args);
    },
  };
}

beforeEach(() => {
  state.patients = [
    { id: targetId, clinic_id: clinicId, merged_into_id: null },
    { id: sourceId, clinic_id: clinicId, merged_into_id: null },
  ];
  state.appointments = [
    owned("66666666-6666-4666-8666-666666666666", targetId),
    owned("66666666-6666-4666-8666-666666666667", sourceId),
  ];
  state.visits = [owned("77777777-7777-4777-8777-777777777777", sourceId)];
  state.contacts = [owned("88888888-8888-4888-8888-888888888888", sourceId)];
  state.files = [owned("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sourceId)];
  state.alerts = [owned("cccccccc-cccc-4ccc-8ccc-cccccccccccc", sourceId)];
  state.anamnesis = [
    { patient_id: targetId, chronic_conditions: "Target history" },
    { patient_id: sourceId, chronic_conditions: "Source history" },
  ];
  state.teeth = [
    {
      id: keptToothId,
      clinic_id: clinicId,
      patient_id: targetId,
      fdi_code: "11",
      status: "sound",
    },
    {
      id: sourceToothId,
      clinic_id: clinicId,
      patient_id: sourceId,
      fdi_code: "11",
      status: "caries",
    },
    {
      id: movedToothId,
      clinic_id: clinicId,
      patient_id: sourceId,
      fdi_code: "21",
      status: "filling",
    },
  ];
  state.history = [
    { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tooth_state_id: sourceToothId, new_status: "watched" },
    { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", tooth_state_id: movedToothId, new_status: "filled" },
  ];
  state.calls = [];
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.createClient.mockImplementation(async () => createMemory());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("mergeCharts", () => {
  it("rejects a dentist before writing", async () => {
    mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "dentist" });

    const result = await mergeCharts(null, mergeForm());

    expect(result).toEqual({ ok: false, error: "Spajanje nije dostupno." });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.calls).toEqual([]);
    expect(chartsInSearch()).toEqual([targetId, sourceId]);
    expect(state.patients).toHaveLength(2);
  });

  it("keeps the started chart, drops the source from search, and leaves the row", async () => {
    const result = await mergeCharts(null, mergeForm());

    expect(result).toEqual({ ok: true, data: { patientId: targetId } });
    expect(state.calls).toEqual([{ target_id: targetId, source_id: sourceId }]);
    expect(chartsInSearch()).toEqual([targetId]);
    expect(state.patients).toEqual([
      { id: targetId, clinic_id: clinicId, merged_into_id: null },
      { id: sourceId, clinic_id: clinicId, merged_into_id: targetId },
    ]);
    expect(state.appointments.every((row) => row.patient_id === targetId)).toBe(true);
    expect(state.visits.every((row) => row.patient_id === targetId)).toBe(true);
    expect(state.contacts.every((row) => row.patient_id === targetId)).toBe(true);
    expect(state.files.every((row) => row.patient_id === targetId)).toBe(true);
    expect(state.alerts.every((row) => row.patient_id === targetId)).toBe(true);
    expect(state.anamnesis).toEqual([
      { patient_id: targetId, chronic_conditions: "Target history" },
    ]);
    expect(state.teeth).toEqual([
      {
        id: keptToothId,
        clinic_id: clinicId,
        patient_id: targetId,
        fdi_code: "11",
        status: "sound",
      },
      {
        id: movedToothId,
        clinic_id: clinicId,
        patient_id: targetId,
        fdi_code: "21",
        status: "filling",
      },
    ]);
    expect(state.history).toEqual([
      { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tooth_state_id: keptToothId, new_status: "watched" },
      { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", tooth_state_id: movedToothId, new_status: "filled" },
      { id: `history-${sourceToothId}`, tooth_state_id: keptToothId, new_status: "caries" },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacijenti", "layout");
  });
});
