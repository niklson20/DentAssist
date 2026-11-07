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

import { saveChartDetails } from "./patients";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "44444444-4444-4444-8444-444444444444";
const otherId = "55555555-5555-4555-8555-555555555555";
const userId = "10000000-0000-4000-8000-000000000002";

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  jmbg: string | null;
};

type Query = {
  slug: string;
  id: string;
  listed: boolean;
  email: string;
};

const state: {
  patients: PatientRow[];
  updates: Record<string, unknown>[];
  lookupError: boolean;
} = {
  patients: [],
  updates: [],
  lookupError: false,
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function detailsForm(overrides: Record<string, string> = {}): FormData {
  return form({
    patientSlug: "nikola-nikolic",
    firstName: " Nikola ",
    lastName: " Nikolić ",
    phone: " 061 123 ",
    dateOfBirth: "1988-04-02",
    sex: "male",
    email: "",
    address: "  Knez Mihailova 1  ",
    note: "   ",
    jmbg: "1234567890123",
    ...overrides,
  });
}

function nikola(): PatientRow {
  return {
    id: patientId,
    first_name: "Nikola",
    last_name: "Nikolić",
    email: null,
    jmbg: "9999999999999",
  };
}

beforeEach(() => {
  state.patients = [nikola()];
  state.updates = [];
  state.lookupError = false;
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "owner" });
  mocks.createClient.mockImplementation(async () => ({
    from(table: string) {
      if (table !== "patients") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          const query: Query = { slug: "", id: "", listed: false, email: "" };
          const builder = {
            eq(column: string, value: string) {
              if (column === "slug") query.slug = value;
              if (column === "id") query.id = value;
              return builder;
            },
            is() {
              return builder;
            },
            ilike(column: string, value: string) {
              if (column === "email") query.email = value.replace(/\\/g, "").replace(/%/g, "").toLowerCase();
              else query.listed = true;
              return builder;
            },
            limit() {
              return builder;
            },
            maybeSingle: async () => {
              if (state.lookupError) return { data: null, error: { code: "XX000" } };
              const row = state.patients.find((item) => item.id === patientId && query.slug === "nikola-nikolic");
              return {
                data: row
                  ? { id: row.id, first_name: row.first_name, last_name: row.last_name, email: row.email }
                  : null,
                error: null,
              };
            },
            then(
              onFulfilled: (value: { data: { id: string; first_name: string; last_name: string }[]; error: null }) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              const rows = query.email
                ? state.patients.filter((item) => (item.email ?? "").toLowerCase() === query.email)
                : state.patients;
              return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
        update(patch: Record<string, unknown>) {
          const builder = {
            eq() {
              return builder;
            },
            is() {
              return builder;
            },
            select() {
              return builder;
            },
            maybeSingle: async () => {
              state.updates.push(patch);
              const row = state.patients.find((item) => item.id === patientId);
              if (row && typeof patch.jmbg === "string") row.jmbg = patch.jmbg;
              if (row && patch.jmbg === null) row.jmbg = null;
              return { data: { id: patientId }, error: null };
            },
          };
          return builder;
        },
      };
    },
  }));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("saveChartDetails", () => {
  it("saves the name, birth date, and pregled fields without changing the chart address", async () => {
    const result = await saveChartDetails(null, detailsForm());

    expect(result).toEqual({ ok: true, data: { patientSlug: "nikola-nikolic" } });
    expect(state.updates).toEqual([
      {
        first_name: "Nikola",
        last_name: "Nikolić",
        phone: "061 123",
        email: null,
        date_of_birth: "1988-04-02",
        sex: "male",
        address: "Knez Mihailova 1",
        note: null,
        jmbg: "1234567890123",
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/pacijenti/nikola-nikolic");
  });

  it("stores a local Serbian number with the +381 prefix", async () => {
    const result = await saveChartDetails(null, detailsForm({ phone: "0655258225" }));

    expect(result.ok).toBe(true);
    expect(state.updates[0]?.phone).toBe("+381655258225");
  });

  it("stores an email in lowercase and clears the declined flag", async () => {
    const result = await saveChartDetails(null, detailsForm({ email: " Ana@Example.com " }));

    expect(result.ok).toBe(true);
    expect(state.updates[0]?.email).toBe("ana@example.com");
    expect(state.updates[0]?.email_declined).toBe(false);
  });

  it("rejects an email that already belongs to another chart", async () => {
    state.patients.push({
      id: otherId,
      first_name: "Mika",
      last_name: "Mikić",
      email: "ana@example.com",
      jmbg: null,
    });

    const result = await saveChartDetails(null, detailsForm({ email: "ana@example.com" }));

    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { email: ["U ordinaciji već postoji pacijent sa tim mejlom."] },
    });
    expect(state.updates).toEqual([]);
  });

  it("asks for confirmation only when the new name already belongs to another chart", async () => {
    state.patients.push({
      id: otherId,
      first_name: "Mika",
      last_name: "Mikić",
      email: null,
      jmbg: null,
    });

    const blocked = await saveChartDetails(
      null,
      detailsForm({ firstName: "Mika", lastName: "Mikić" }),
    );
    expect(blocked).toEqual({
      ok: false,
      error: "U ordinaciji već postoji pacijent sa istim imenom i prezimenom. Potvrdite unos.",
      fieldErrors: {
        duplicateConfirmed: ["U ordinaciji već postoji pacijent sa istim imenom i prezimenom. Potvrdite unos."],
      },
    });
    expect(state.updates).toEqual([]);

    const confirmed = await saveChartDetails(
      null,
      detailsForm({ firstName: "Mika", lastName: "Mikić", duplicateConfirmed: "da" }),
    );
    expect(confirmed.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
  });

  it("keeps the same name even when another chart already uses it", async () => {
    state.patients.push({
      id: otherId,
      first_name: "Nikola",
      last_name: "Nikolić",
      email: null,
      jmbg: null,
    });

    const result = await saveChartDetails(null, detailsForm({ phone: "062 000" }));

    expect(result.ok).toBe(true);
    expect(state.updates[0]?.phone).toBe("062 000");
  });

  it("does not let reception write JMBG", async () => {
    mocks.requireMember.mockResolvedValue({ userId, clinicId, role: "reception" });

    const result = await saveChartDetails(null, detailsForm({ jmbg: "1234567890123" }));

    expect(result.ok).toBe(true);
    expect(state.updates[0]).not.toHaveProperty("jmbg");
    expect(state.patients[0]?.jmbg).toBe("9999999999999");
  });

  it("rejects a short JMBG before writing", async () => {
    const result = await saveChartDetails(null, detailsForm({ jmbg: "123" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.jmbg).toEqual(["JMBG ima 13 cifara."]);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("rejects a birth date in the future", async () => {
    const result = await saveChartDetails(null, detailsForm({ dateOfBirth: "2999-01-01" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.dateOfBirth).toEqual(["Datum rođenja ne može biti u budućnosti."]);
    }
    expect(state.updates).toEqual([]);
  });

  it("does not write when the chart is missing", async () => {
    const result = await saveChartDetails(null, detailsForm({ patientSlug: "nema-kartona" }));

    expect(result).toEqual({ ok: false, error: "Karton nije pronađen." });
    expect(state.updates).toEqual([]);
  });
});
