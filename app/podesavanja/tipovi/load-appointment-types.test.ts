import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { loadAppointmentTypesPage } from "./load-appointment-types";

const clinicId = "11111111-1111-4111-8111-111111111111";
const typeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  mocks.from.mockReset();
  mocks.createClient.mockReset();
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadAppointmentTypesPage", () => {
  it("returns types and default id", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointment_types") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: typeId, name: "Pregled", sort_order: 0, active: true },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
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

    const loaded = await loadAppointmentTypesPage(clinicId);
    expect(loaded).toEqual({
      status: "ready",
      defaultTypeId: typeId,
      types: [{ id: typeId, name: "Pregled", sortOrder: 0, active: true }],
    });
  });

  it("returns unavailable on query error", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointment_types") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: null, error: { code: "err" } }),
              }),
            }),
          }),
        };
      }
      if (table === "clinics") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const loaded = await loadAppointmentTypesPage(clinicId);
    expect(loaded).toEqual({ status: "unavailable" });
  });
});
