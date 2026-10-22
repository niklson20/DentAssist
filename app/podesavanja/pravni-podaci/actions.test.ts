import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { saveLegalData } from "./actions";

const clinicId = "11111111-1111-4111-8111-111111111111";

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
  mocks.requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveLegalData", () => {
  it("rejects an overly long PIB", async () => {
    const result = await saveLegalData(
      null,
      form({
        taxId: "1".repeat(51),
        registrationNumber: "",
        licenseNumber: "",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("updates legal columns and revalidates", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: clinicId }, error: null }),
        }),
      }),
    });
    mocks.from.mockReturnValue({ update });

    const result = await saveLegalData(
      null,
      form({
        taxId: " 123 ",
        registrationNumber: "456",
        licenseNumber: "",
      }),
    );

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      tax_id: "123",
      registration_number: "456",
      license_number: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/pravni-podaci");
  });
});
