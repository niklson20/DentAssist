import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { loadLegalDataPage } from "./load-legal-data";

const clinicId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.rpc.mockReset();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadLegalDataPage", () => {
  it("maps rpc rows to form fields", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          tax_id: "123",
          registration_number: null,
          license_number: "R-1",
        },
      ],
      error: null,
    });

    const result = await loadLegalDataPage(clinicId);
    expect(mocks.rpc).toHaveBeenCalledWith("clinic_legal_fields", { target_clinic_id: clinicId });
    expect(result).toEqual({
      status: "ready",
      fields: {
        taxId: "123",
        registrationNumber: "",
        licenseNumber: "R-1",
      },
    });
  });

  it("returns unavailable when rpc fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "500" } });
    const result = await loadLegalDataPage(clinicId);
    expect(result).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when rpc returns no rows", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const result = await loadLegalDataPage(clinicId);
    expect(result).toEqual({ status: "unavailable" });
  });
});
