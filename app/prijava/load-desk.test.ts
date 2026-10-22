import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  listReceptionDevice: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  listReceptionDevice: mocks.listReceptionDevice,
}));

import { loadReceptionDesk } from "@/app/prijava/load-desk";
import { hashDeviceSecret } from "@/lib/clinic-invite";

const pepper = "test-pepper";
const memberId = "22222222-2222-4222-8222-222222222222";
let previousPepper: string | undefined;

beforeEach(() => {
  previousPepper = process.env.TOKEN_PEPPER;
  process.env.TOKEN_PEPPER = pepper;
  mocks.cookieGet.mockReset();
  mocks.listReceptionDevice.mockReset();
});

afterEach(() => {
  if (previousPepper === undefined) {
    delete process.env.TOKEN_PEPPER;
  } else {
    process.env.TOKEN_PEPPER = previousPepper;
  }
});

describe("loadReceptionDesk", () => {
  it("offers the clinic and the names on a live device", async () => {
    mocks.cookieGet.mockReturnValue({ value: "device-secret" });
    mocks.listReceptionDevice.mockResolvedValue({
      status: "ok",
      clinicName: "Ordinacija",
      members: [{ id: memberId, firstName: "Ana", lastName: "Jović" }],
    });

    await expect(loadReceptionDesk()).resolves.toEqual({
      clinicName: "Ordinacija",
      members: [{ id: memberId, firstName: "Ana", lastName: "Jović" }],
    });
    expect(mocks.listReceptionDevice).toHaveBeenCalledWith(hashDeviceSecret("device-secret", pepper));
  });

  it("does not offer names when the device is revoked", async () => {
    mocks.cookieGet.mockReturnValue({ value: "device-secret" });
    mocks.listReceptionDevice.mockResolvedValue({ status: "invalid" });

    await expect(loadReceptionDesk()).resolves.toBeNull();
  });

  it("does not offer names without the device cookie", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(loadReceptionDesk()).resolves.toBeNull();
    expect(mocks.listReceptionDevice).not.toHaveBeenCalled();
  });
});
