import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import {
  addAppointmentType,
  deactivateAppointmentType,
  renameAppointmentType,
  setDefaultAppointmentType,
} from "./actions";

const clinicId = "11111111-1111-4111-8111-111111111111";
const typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherTypeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  mocks.requireOwner.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.from.mockReset();
  mocks.insert.mockReset();
  mocks.update.mockReset();
  mocks.select.mockReset();
  mocks.requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("addAppointmentType", () => {
  it("rejects an empty name", async () => {
    const result = await addAppointmentType(null, form({ name: "" }));
    expect(result.ok).toBe(false);
  });

  it("inserts a type and sets default when missing", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointment_types") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: typeId }, error: null }),
            }),
          }),
        };
      }
      if (table === "clinics") {
        const chain = {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { default_appointment_type_id: null },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await addAppointmentType(null, form({ name: "Pregled" }));
    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/tipovi");
  });
});

describe("renameAppointmentType", () => {
  it("updates the name", async () => {
    mocks.from.mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: typeId }, error: null }),
            }),
          }),
        }),
      }),
    }));

    const result = await renameAppointmentType(
      null,
      form({ typeId, name: "Kontrola" }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("deactivateAppointmentType", () => {
  it("blocks deactivating the default type", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinics") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { default_appointment_type_id: typeId },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await deactivateAppointmentType(null, form({ typeId }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Podrazumevani tip");
    }
  });

  it("deactivates a non-default type", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinics") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { default_appointment_type_id: typeId },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "appointment_types") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: otherTypeId }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await deactivateAppointmentType(null, form({ typeId: otherTypeId }));
    expect(result.ok).toBe(true);
  });
});

describe("setDefaultAppointmentType", () => {
  it("rejects inactive types", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointment_types") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: typeId, active: false }, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await setDefaultAppointmentType(null, form({ typeId }));
    expect(result.ok).toBe(false);
  });

  it("updates the clinic default", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointment_types") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: typeId, active: true }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "clinics") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: clinicId }, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await setDefaultAppointmentType(null, form({ typeId }));
    expect(result.ok).toBe(true);
  });
});
