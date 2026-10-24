import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DayGridModel } from "@/app/danas/day-calendar";
import { DayGrid } from "@/app/danas/day-grid";

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

import { saveAlert, saveAnamnesis } from "./patients";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "44444444-4444-4444-8444-444444444444";
const userId = "10000000-0000-4000-8000-000000000002";

type AnamnesisRow = {
  patient_id: string;
  clinic_id: string;
  chronic_conditions: string | null;
  medications: string | null;
  allergies: string | null;
  pregnancy: string | null;
};

type AlertRow = {
  patient_id: string;
  clinic_id: string;
  code: string;
  note: string;
};

const state: {
  anamnesis: AnamnesisRow[];
  alerts: AlertRow[];
  patientFound: boolean;
} = {
  anamnesis: [],
  alerts: [],
  patientFound: true,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function anamnesisForm(overrides: Record<string, string> = {}): FormData {
  return form({
    patientId,
    chronicConditions: "Dijabetes",
    medications: "Aspirin",
    allergies: "Opis alergije",
    pregnancy: "   ",
    ...overrides,
  });
}

beforeEach(() => {
  state.anamnesis = [];
  state.alerts = [];
  state.patientFound = true;
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.createClient.mockImplementation(async () => ({
    from(table: string) {
      if (table === "patients") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  maybeSingle: async () =>
                    state.patientFound
                      ? { data: { id: patientId }, error: null }
                      : { data: null, error: null },
                }),
              }),
            }),
          }),
        };
      }
      if (table === "patient_anamnesis") {
        return {
          upsert: async (row: AnamnesisRow) => {
            const index = state.anamnesis.findIndex((item) => item.patient_id === row.patient_id);
            if (index >= 0) {
              state.anamnesis[index] = row;
            } else {
              state.anamnesis.push(row);
            }
            return { error: null };
          },
        };
      }
      if (table === "patient_alerts") {
        return {
          insert: async (row: AlertRow) => {
            state.alerts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("saveAnamnesis", () => {
  it("keeps one anamnesis row and replaces it on the next save", async () => {
    const first = await saveAnamnesis(null, anamnesisForm());
    const second = await saveAnamnesis(
      null,
      anamnesisForm({
        medications: "Ibuprofen",
        allergies: "Lateks",
        pregnancy: "Treci trimestar",
      }),
    );

    expect(first).toEqual({ ok: true, data: { patientId } });
    expect(second).toEqual({ ok: true, data: { patientId } });
    expect(state.anamnesis).toEqual([
      {
        patient_id: patientId,
        clinic_id: clinicId,
        chronic_conditions: "Dijabetes",
        medications: "Ibuprofen",
        allergies: "Lateks",
        pregnancy: "Treci trimestar",
      },
    ]);
    expect(state.alerts).toEqual([]);
  });

  it("does not write a second row when the chart is missing", async () => {
    state.patientFound = false;

    const result = await saveAnamnesis(null, anamnesisForm());

    expect(result).toEqual({ ok: false, error: "Karton nije pronađen." });
    expect(state.anamnesis).toEqual([]);
  });

  it("rejects an empty chart id before writing", async () => {
    const result = await saveAnamnesis(null, anamnesisForm({ patientId: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.patientId).toEqual(["Izaberite karton."]);
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.anamnesis).toEqual([]);
  });
});

describe("saveAlert", () => {
  it.each(["drug_allergy", "pregnancy", "coagulation", "other"] as const)(
    "stores the %s warning as a code and a short note",
    async (code) => {
      const result = await saveAlert(
        null,
        form({ patientId, code, note: "  Penicilin  " }),
      );

      expect(result).toEqual({ ok: true, data: { patientId } });
      expect(state.alerts).toEqual([
        {
          patient_id: patientId,
          clinic_id: clinicId,
          code,
          note: "Penicilin",
        },
      ]);
      expect(state.anamnesis).toEqual([]);
    },
  );

  it("rejects a blank note and an unknown code", async () => {
    const blank = await saveAlert(null, form({ patientId, code: "other", note: "   " }));
    const unknown = await saveAlert(null, form({ patientId, code: "aspirin", note: "Penicilin" }));

    expect(blank.ok).toBe(false);
    if (!blank.ok) {
      expect(blank.fieldErrors?.note).toEqual(["Unesite kratak tekst."]);
    }
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.fieldErrors?.code).toEqual(["Izaberite šifru."]);
    }
    expect(state.alerts).toEqual([]);
    expect(JSON.stringify(unknown)).not.toContain("Penicilin");
  });

  it("hides the warning from reception", async () => {
    mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "reception" });

    const result = await saveAlert(null, form({ patientId, code: "drug_allergy", note: "Penicilin" }));

    expect(result).toEqual({ ok: false, error: "Upozorenje nije dostupno." });
    expect(result.ok ? "" : JSON.stringify(result)).not.toContain("Penicilin");
    expect(result.ok ? "" : JSON.stringify(result)).not.toContain("drug_allergy");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(state.alerts).toEqual([]);
  });
});

describe("daily appointment warning", () => {
  it("prints the warning text on that appointment and leaves the grid in place", () => {
    const warned = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const plain = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    const model = {
      span: 8,
      hours: [{ hour: 9, label: "09:00", top: "0%" }],
      columns: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Ana Anić",
          visits: [
            {
              id: warned,
              status: "scheduled",
              label: "Mika Mikić",
              timeLabel: "10:00–10:30",
              top: "12.5%",
              height: "6.25%",
              alertNote: "Penicilin",
            },
            {
              id: plain,
              status: "scheduled",
              label: "Laza Lazić",
              timeLabel: "11:00–11:30",
              top: "25%",
              height: "6.25%",
            },
          ],
        },
      ],
    } as DayGridModel;

    const html = renderToStaticMarkup(createElement(DayGrid, { model }));
    const hours = html.slice(html.indexOf("calendar-grid__hours"), html.indexOf("calendar-grid__columns"));
    const visits = html.split('class="calendar-grid__visit"').slice(1);
    const firstVisit = visits[0] ?? "";
    const secondVisit = visits[1] ?? "";

    expect(html.indexOf("calendar-grid__hours")).toBeLessThan(html.indexOf("calendar-grid__columns"));
    expect(html).toContain('class="calendar-grid"');
    expect(hours).not.toContain("Penicilin");
    expect(firstVisit).toContain("Mika Mikić");
    expect(firstVisit).toContain("10:00–10:30");
    expect(firstVisit).toContain('role="alert"');
    expect(firstVisit).toContain("Penicilin");
    expect(secondVisit).toContain("Laza Lazić");
    expect(secondVisit).not.toContain("Penicilin");
    expect(secondVisit).not.toContain('role="alert"');
  });
});
