import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createClient,
}));

import { loadChildLinkPreview } from "./load-child-link";

beforeEach(() => {
  process.env.TOKEN_PEPPER = "pepper";
  createClient.mockReset();
});

describe("loadChildLinkPreview", () => {
  it("accepts only a status word, so an attached child name is not a preview", async () => {
    createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: { status: "open", first_name: "Mika", last_name: "Mikić" },
        error: null,
      })),
    });

    const preview = await loadChildLinkPreview("centar", "abcdefghijklmnopqrstuvwxyz0123456789ABCDE");
    expect(preview).toEqual({ status: "unavailable" });
    expect(JSON.stringify(preview)).not.toContain("Mika");
  });

  it("returns open when the database sends only that word", async () => {
    createClient.mockResolvedValue({
      rpc: vi.fn(async () => ({ data: "open", error: null })),
    });

    await expect(
      loadChildLinkPreview("centar", "abcdefghijklmnopqrstuvwxyz0123456789ABCDE"),
    ).resolves.toEqual({ status: "open" });
  });
});
