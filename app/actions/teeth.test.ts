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

import { loadToothChart, saveToothStatus, saveToothSurfaces, undoToothChange } from "./teeth";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const userId = "10000000-0000-4000-8000-000000000002";
const memberId = "33333333-3333-4333-8333-333333333333";
const stateId = "44444444-4444-4444-8444-444444444444";
const changeId = "55555555-5555-4555-8555-555555555555";
const olderChangeId = "66666666-6666-4666-8666-666666666666";

type ToothState = {
  id: string;
  patient_id: string;
  clinic_id: string;
  fdi_code: string;
  status: string;
  surfaces: string[] | null;
};

type ToothChange = {
  id: string;
  tooth_state_id: string;
  clinic_id: string;
  old_status: string | null;
  new_status: string;
  old_surfaces: string[] | null;
  new_surfaces: string[] | null;
  changed_by: string | null;
  changed_at: string;
};

const state: {
  patientFound: boolean;
  toothStates: ToothState[];
  toothChanges: ToothChange[];
  upserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  rpcStatus: string | null;
} = {
  patientFound: true,
  toothStates: [],
  toothChanges: [],
  upserts: [],
  updates: [],
  rpcCalls: [],
  rpcStatus: null,
};

function clinicalMember(role: "owner" | "dentist" | "reception" = "dentist") {
  mocks.requireMember.mockResolvedValue({ userId, clinicId, role });
}

function chain(result: { data: unknown; error: null | { code?: string } }) {
  const api: Record<string, unknown> = {
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    in: vi.fn(() => api),
    is: vi.fn(() => api),
    order: vi.fn(() => api),
    limit: vi.fn(() => api),
    maybeSingle: vi.fn(async () => result),
    then: undefined,
  };
  api.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return api;
}

function applyRevert(changeIdArg: string): { status: string } {
  const change = state.toothChanges.find((row) => row.id === changeIdArg);
  if (!change) return { status: "missing" };

  const latest = [...state.toothChanges]
    .filter((row) => row.tooth_state_id === change.tooth_state_id)
    .sort((left, right) => {
      const byTime = right.changed_at.localeCompare(left.changed_at);
      return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
    })[0];
  if (!latest || latest.id !== change.id) return { status: "not_latest" };

  const tooth = state.toothStates.find((row) => row.id === change.tooth_state_id);
  if (!tooth) return { status: "missing" };

  tooth.status = change.old_status ?? "healthy";
  tooth.surfaces = change.old_status == null ? null : change.old_surfaces;
  state.toothChanges = state.toothChanges.filter((row) => row.id !== change.id);
  return { status: "ok" };
}

beforeEach(() => {
  state.patientFound = true;
  state.toothStates = [];
  state.toothChanges = [];
  state.upserts = [];
  state.updates = [];
  state.rpcCalls = [];
  state.rpcStatus = null;
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  clinicalMember();

  mocks.createClient.mockImplementation(async () => ({
    from(table: string) {
      if (table === "patients") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () => ({
                    data: state.patientFound ? { id: patientId } : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "tooth_states") {
        return {
          select: (_columns: string) => {
            const filtered = { clinicId: clinicId as string | null, patientId: null as string | null, fdi: null as string | null, id: null as string | null };
            const api = {
              eq(column: string, value: string) {
                if (column === "clinic_id") filtered.clinicId = value;
                if (column === "patient_id") filtered.patientId = value;
                if (column === "fdi_code") filtered.fdi = value;
                if (column === "id") filtered.id = value;
                return api;
              },
              maybeSingle: async () => {
                const row = state.toothStates.find((item) => {
                  if (filtered.id) return item.id === filtered.id;
                  return (
                    item.clinic_id === filtered.clinicId &&
                    item.patient_id === (filtered.patientId ?? patientId) &&
                    (!filtered.fdi || item.fdi_code === filtered.fdi)
                  );
                });
                return { data: row ?? null, error: null };
              },
              then: (resolve: (value: unknown) => unknown) =>
                Promise.resolve({
                  data: state.toothStates.filter(
                    (item) =>
                      item.clinic_id === filtered.clinicId &&
                      (!filtered.patientId || item.patient_id === filtered.patientId),
                  ),
                  error: null,
                }).then(resolve),
            };
            return api;
          },
          upsert: async (payload: Record<string, unknown>) => {
            state.upserts.push(payload);
            const fdi = String(payload.fdi_code);
            const existing = state.toothStates.find((row) => row.fdi_code === fdi);
            if (existing) {
              existing.status = String(payload.status);
              existing.surfaces = (payload.surfaces as string[] | null) ?? null;
            } else {
              state.toothStates.push({
                id: stateId,
                patient_id: String(payload.patient_id),
                clinic_id: String(payload.clinic_id),
                fdi_code: fdi,
                status: String(payload.status),
                surfaces: (payload.surfaces as string[] | null) ?? null,
              });
            }
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => {
            state.updates.push(payload);
            const api = {
              eq(column: string, value: string) {
                if (column === "clinic_id" || column === "patient_id" || column === "fdi_code" || column === "id") {
                  const row = state.toothStates.find((item) => {
                    if (column === "id") return item.id === value;
                    if (column === "fdi_code") return item.fdi_code === value;
                    return true;
                  });
                  if (row) {
                    if (typeof payload.status === "string") row.status = payload.status;
                    if ("surfaces" in payload) row.surfaces = (payload.surfaces as string[] | null) ?? null;
                  }
                }
                return api;
              },
              then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
            };
            return api;
          },
        };
      }

      if (table === "tooth_state_changes") {
        return {
          select: () => {
            const filtered = {
              clinicId: clinicId as string | null,
              stateIds: null as string[] | null,
              stateId: null as string | null,
            };
            const api = {
              eq(column: string, value: string) {
                if (column === "clinic_id") filtered.clinicId = value;
                if (column === "tooth_state_id") filtered.stateId = value;
                return api;
              },
              in(_column: string, values: string[]) {
                filtered.stateIds = values;
                return api;
              },
              order: () => api,
              limit: () => api,
              maybeSingle: async () => {
                const rows = state.toothChanges
                  .filter((row) => {
                    if (filtered.stateId) return row.tooth_state_id === filtered.stateId;
                    if (filtered.stateIds) return filtered.stateIds.includes(row.tooth_state_id);
                    return true;
                  })
                  .sort((left, right) => right.changed_at.localeCompare(left.changed_at));
                return { data: rows[0] ?? null, error: null };
              },
              then: (resolve: (value: unknown) => unknown) => {
                const rows = state.toothChanges
                  .filter((row) => {
                    if (filtered.stateId) return row.tooth_state_id === filtered.stateId;
                    if (filtered.stateIds) return filtered.stateIds.includes(row.tooth_state_id);
                    return true;
                  })
                  .sort((left, right) => right.changed_at.localeCompare(left.changed_at));
                return Promise.resolve({ data: rows, error: null }).then(resolve);
              },
            };
            return api;
          },
        };
      }

      if (table === "clinic_members") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: [
                  {
                    id: memberId,
                    role: "dentist",
                    first_name: "Ana",
                    last_name: "Anić",
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      return chain({ data: null, error: { code: "unknown_table" } });
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ fn, args });
      if (fn !== "revert_tooth_change") {
        return { data: null, error: { code: "unknown_rpc" } };
      }
      if (state.rpcStatus) {
        return { data: { status: state.rpcStatus }, error: null };
      }
      const changeIdArg = args.p_change_id;
      if (typeof changeIdArg !== "string") {
        return { data: { status: "missing" }, error: null };
      }
      return { data: applyRevert(changeIdArg), error: null };
    },
  }));
});

describe("teeth actions", () => {
  it("hides the map from reception and rejects a missing chart", async () => {
    clinicalMember("reception");
    const hidden = await loadToothChart(patientId);
    expect(hidden).toEqual({ ok: false, error: "Zubna mapa nije dostupna." });

    clinicalMember("dentist");
    state.patientFound = false;
    const missing = await saveToothStatus({ patientId, fdiCode: "11", status: "crown" });
    expect(missing).toEqual({ ok: false, error: "Karton nije pronađen." });
  });

  it("upserts status without writing tooth_state_changes manually", async () => {
    const result = await saveToothStatus({ patientId, fdiCode: "11", status: "caries" });
    expect(result.ok).toBe(true);
    expect(state.upserts).toEqual([
      {
        patient_id: patientId,
        clinic_id: clinicId,
        fdi_code: "11",
        status: "caries",
        surfaces: null,
      },
    ]);
    expect(JSON.stringify(state.upserts)).not.toContain("tooth_state_changes");
    if (result.ok) {
      expect(result.data.chart.teeth["11"].status).toBe("caries");
    }
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacijenti", "layout");
  });

  it("updates surfaces only for caries or filling", async () => {
    state.toothStates = [
      {
        id: stateId,
        patient_id: patientId,
        clinic_id: clinicId,
        fdi_code: "21",
        status: "filling",
        surfaces: null,
      },
    ];
    const saved = await saveToothSurfaces({
      patientId,
      fdiCode: "21",
      surfaces: ["occlusal", "distal"],
    });
    expect(saved.ok).toBe(true);
    expect(state.updates[0]).toEqual({ surfaces: ["occlusal", "distal"] });

    state.toothStates[0].status = "crown";
    const rejected = await saveToothSurfaces({
      patientId,
      fdiCode: "21",
      surfaces: ["occlusal"],
    });
    expect(rejected).toEqual({ ok: false, error: "Proverite unete podatke." });
  });

  it("reverts the latest change via RPC without a client tooth_states update", async () => {
    state.toothStates = [
      {
        id: stateId,
        patient_id: patientId,
        clinic_id: clinicId,
        fdi_code: "45",
        status: "fracture",
        surfaces: null,
      },
    ];
    state.toothChanges = [
      {
        id: changeId,
        tooth_state_id: stateId,
        clinic_id: clinicId,
        old_status: "root_canal",
        new_status: "fracture",
        old_surfaces: null,
        new_surfaces: null,
        changed_by: memberId,
        changed_at: "2026-11-11T12:00:00.000Z",
      },
    ];

    const result = await undoToothChange({ patientId, fdiCode: "45", changeId });
    expect(result.ok).toBe(true);
    expect(state.rpcCalls).toEqual([{ fn: "revert_tooth_change", args: { p_change_id: changeId } }]);
    expect(state.updates).toEqual([]);
    expect(state.toothChanges).toEqual([]);
    expect(state.toothStates[0].status).toBe("root_canal");
    if (result.ok) {
      expect(result.data.chart.teeth["45"].status).toBe("root_canal");
      expect(result.data.chart.changes).toEqual([]);
    }
  });

  it("rejects an older change id as not_latest", async () => {
    state.toothStates = [
      {
        id: stateId,
        patient_id: patientId,
        clinic_id: clinicId,
        fdi_code: "45",
        status: "fracture",
        surfaces: null,
      },
    ];
    state.toothChanges = [
      {
        id: olderChangeId,
        tooth_state_id: stateId,
        clinic_id: clinicId,
        old_status: "healthy",
        new_status: "root_canal",
        old_surfaces: null,
        new_surfaces: null,
        changed_by: memberId,
        changed_at: "2026-11-10T12:00:00.000Z",
      },
      {
        id: changeId,
        tooth_state_id: stateId,
        clinic_id: clinicId,
        old_status: "root_canal",
        new_status: "fracture",
        old_surfaces: null,
        new_surfaces: null,
        changed_by: memberId,
        changed_at: "2026-11-11T12:00:00.000Z",
      },
    ];

    const result = await undoToothChange({ patientId, fdiCode: "45", changeId: olderChangeId });
    expect(result).toEqual({
      ok: false,
      error: "Može se poništiti samo poslednja izmena za taj zub.",
    });
    expect(state.toothChanges).toHaveLength(2);
    expect(state.toothStates[0].status).toBe("fracture");
  });

  it("hides undo from reception", async () => {
    clinicalMember("reception");
    const result = await undoToothChange({ patientId, fdiCode: "45", changeId });
    expect(result).toEqual({ ok: false, error: "Zubna mapa nije dostupna." });
    expect(state.rpcCalls).toEqual([]);
  });

  it("maps RPC forbidden to the hidden map error", async () => {
    state.rpcStatus = "forbidden";
    const result = await undoToothChange({ patientId, fdiCode: "45", changeId });
    expect(result).toEqual({ ok: false, error: "Zubna mapa nije dostupna." });
    expect(state.rpcCalls).toEqual([{ fn: "revert_tooth_change", args: { p_change_id: changeId } }]);
  });
});
