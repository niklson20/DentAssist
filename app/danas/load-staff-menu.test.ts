import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

import { loadStaffMenuRole } from "./load-staff-menu";
import { SESSION_GATE_COOKIE } from "@/proxy";

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.rpc.mockReset();
  mocks.cookieGet.mockReset();
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.rpc.mockResolvedValue({ data: "owner", error: null });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadStaffMenuRole", () => {
  it("does not look up a role outside a staff session", async () => {
    expect(await loadStaffMenuRole()).toBeNull();
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "patient" } : undefined,
    );
    expect(await loadStaffMenuRole()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns the staff role from the database helper", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "staff" } : undefined,
    );
    expect(await loadStaffMenuRole()).toBe("owner");
    mocks.rpc.mockResolvedValue({ data: "reception", error: null });
    expect(await loadStaffMenuRole()).toBe("reception");
  });

  it("hides statistics when the role cannot be read", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "staff" } : undefined,
    );
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await loadStaffMenuRole()).toBeNull();
    mocks.rpc.mockResolvedValue({ data: "guest", error: null });
    expect(await loadStaffMenuRole()).toBeNull();
    mocks.createClient.mockRejectedValue(new Error("down"));
    expect(await loadStaffMenuRole()).toBeNull();
  });
});
