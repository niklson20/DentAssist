import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  cookies: vi.fn(),
  cookieSet: vi.fn(),
  deviceHash: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));
vi.mock("@/lib/reception-device", () => ({ deviceHash: mocks.deviceHash }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { pairCurrentDevice, revokeClinicDevice } from "./actions";

const clinicId = "11111111-1111-4111-8111-111111111111";
const memberId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const deviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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
  mocks.cookies.mockReset();
  mocks.cookieSet.mockReset();
  mocks.deviceHash.mockReset();
  mocks.from.mockReset();
  mocks.requireOwner.mockResolvedValue({ userId: "u1", clinicId, role: "owner" });
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  mocks.cookies.mockResolvedValue({ set: mocks.cookieSet });
  mocks.deviceHash.mockResolvedValue({ status: "missing" });
  process.env.TOKEN_PEPPER = "pepper";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.TOKEN_PEPPER;
  vi.restoreAllMocks();
});

describe("pairCurrentDevice", () => {
  it("rejects an empty label", async () => {
    const result = await pairCurrentDevice(null, form({ label: "" }));
    expect(result.ok).toBe(false);
  });

  it("inserts a device and sets the cookie", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_members") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: memberId }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "clinic_devices") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    const result = await pairCurrentDevice(null, form({ label: "Recepcija" }));
    expect(result.ok).toBe(true);
    expect(mocks.cookieSet).toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/uredjaji");
  });
});

describe("revokeClinicDevice", () => {
  it("rejects an invalid device id", async () => {
    const result = await revokeClinicDevice(null, form({ deviceId: "bad" }));
    expect(result.ok).toBe(false);
  });

  it("revokes a device", async () => {
    mocks.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ data: [{ id: deviceId }], error: null }),
            }),
          }),
        }),
      }),
    });

    const result = await revokeClinicDevice(null, form({ deviceId }));
    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/uredjaji");
  });
});
