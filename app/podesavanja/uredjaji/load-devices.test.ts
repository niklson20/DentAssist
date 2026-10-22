import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  deviceHash: vi.fn(),
  listReceptionDevice: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/reception-device", () => ({ deviceHash: mocks.deviceHash }));
vi.mock("@/lib/supabase/admin", () => ({
  listReceptionDevice: mocks.listReceptionDevice,
}));

import { loadDevicesPage } from "./load-devices";

const clinicId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.from.mockReset();
  mocks.select.mockReset();
  mocks.deviceHash.mockReset();
  mocks.listReceptionDevice.mockReset();
  mocks.createClient.mockResolvedValue({ from: mocks.from });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadDevicesPage", () => {
  it("returns devices and link state", async () => {
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                label: "Recepcija",
                created_at: "2026-01-01T10:00:00Z",
                revoked_at: null,
              },
            ],
            error: null,
          }),
        }),
      }),
    });
    mocks.deviceHash.mockResolvedValue({ status: "ok", hash: "a".repeat(64) });
    mocks.listReceptionDevice.mockResolvedValue({ status: "ok", clinicName: "Ord", members: [] });

    const result = await loadDevicesPage(clinicId);
    expect(result).toEqual({
      status: "ready",
      thisBrowserLinked: true,
      devices: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          label: "Recepcija",
          createdAt: "2026-01-01T10:00:00Z",
          revokedAt: null,
        },
      ],
    });
  });

  it("returns unavailable on query error", async () => {
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { code: "500" } }),
        }),
      }),
    });

    const result = await loadDevicesPage(clinicId);
    expect(result).toEqual({ status: "unavailable" });
  });
});
