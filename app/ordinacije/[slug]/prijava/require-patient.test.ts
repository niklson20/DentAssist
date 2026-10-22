import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, createClient } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));

import { patientAuthPath, requirePatient } from "@/lib/auth";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";

type Account = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
} | null;

function fakeClient(userId: string | null, account: Account, accountError?: string): SupabaseClient {
  return {
    auth: {
      getUser: async () =>
        userId
          ? { data: { user: { id: userId } }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: account,
            error: accountError ? { message: accountError } : null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  redirect.mockClear();
  createClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("requirePatient", () => {
  it("does not let an unconfirmed email pass for a request", async () => {
    createClient.mockResolvedValue(
      fakeClient("user-1", { id: "acc-1", email: "ana@example.com", email_confirmed_at: null }),
    );

    await expect(
      requirePatient({ purpose: "request", slug: "centar", stomatolog: dentistId, pocetak: startsAt }),
    ).rejects.toThrow(
      `REDIRECT:${patientAuthPath("centar", "registracija", { stomatolog: dentistId, pocetak: startsAt })}`,
    );
  });

  it("lets a confirmed email pass for a request", async () => {
    createClient.mockResolvedValue(
      fakeClient("user-1", {
        id: "acc-1",
        email: "ana@example.com",
        email_confirmed_at: "2026-10-22T10:00:00.000Z",
      }),
    );

    await expect(requirePatient({ purpose: "request", slug: "centar" })).resolves.toEqual({
      userId: "user-1",
      accountId: "acc-1",
      email: "ana@example.com",
      emailConfirmedAt: "2026-10-22T10:00:00.000Z",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps an unconfirmed account when the call is not a request", async () => {
    createClient.mockResolvedValue(
      fakeClient("user-1", { id: "acc-1", email: "ana@example.com", email_confirmed_at: null }),
    );

    await expect(requirePatient({ slug: "centar" })).resolves.toMatchObject({
      emailConfirmedAt: null,
    });
  });

  it("sends a visitor without a patient row to login", async () => {
    createClient.mockResolvedValue(fakeClient("user-1", null));
    await expect(requirePatient({ slug: "centar" })).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
  });

  it("sends an anonymous visitor to login", async () => {
    createClient.mockResolvedValue(fakeClient(null, null));
    await expect(requirePatient({ slug: "centar" })).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
  });
});
