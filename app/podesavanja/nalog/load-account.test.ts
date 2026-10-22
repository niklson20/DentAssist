import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, rpc } = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createClient,
}));

import { loadOwnPinState } from "./load-account";

beforeEach(() => {
  createClient.mockReset();
  rpc.mockReset();
  createClient.mockResolvedValue({ rpc });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadOwnPinState", () => {
  it("reports a saved PIN without reading the hash", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(loadOwnPinState()).resolves.toBe("set");
    expect(rpc).toHaveBeenCalledWith("own_pin_is_set");
  });

  it("reports an empty PIN", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(loadOwnPinState()).resolves.toBe("unset");
  });

  it("stays unavailable when the read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(loadOwnPinState()).resolves.toBe("unavailable");
  });
});
