import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  requireMember: vi.fn(),
  createClient: vi.fn(),
  signOut: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));
vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  createSupabaseServerClient: mocks.createClient,
}));

import { showCalendarDay, signOutStaff } from "./actions";
import { SESSION_GATE_COOKIE } from "@/proxy";

const dentistId = "22222222-2222-4222-8222-222222222222";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  mocks.redirect.mockClear();
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.signOut.mockReset();
  mocks.cookieSet.mockReset();
  mocks.requireMember.mockResolvedValue({ userId: "u1", clinicId: "c1", role: "dentist" });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("showCalendarDay", () => {
  it("rejects a date that is not a real day", async () => {
    const result = await showCalendarDay(
      null,
      form({ prikaz: "dan", datum: "2026-02-31", stomatolog: "", sakrijOtkazane: "da" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { datum: ["Unesite datum."] },
    });
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("opens the address with the dentist and cancelled visits still hidden or shown", async () => {
    await expect(
      showCalendarDay(
        null,
        form({
          prikaz: "nedelja",
          datum: "2026-06-08",
          stomatolog: dentistId,
          sakrijOtkazane: "ne",
        }),
      ),
    ).rejects.toThrow(
      `REDIRECT:/danas?prikaz=nedelja&datum=2026-06-08&stomatolog=${dentistId}&sakrijOtkazane=ne`,
    );
    expect(mocks.requireMember).toHaveBeenCalledOnce();
  });
});

describe("signOutStaff", () => {
  it("ends the local session and returns to sign-in", async () => {
    await expect(signOutStaff(null, new FormData())).rejects.toThrow("REDIRECT:/prijava");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    const gate = mocks.cookieSet.mock.calls.find(([name]) => name === SESSION_GATE_COOKIE);
    expect(gate?.[1]).toBe("");
    expect(gate?.[2].maxAge).toBe(0);
  });

  it("stays signed in when sign-out is rejected", async () => {
    mocks.signOut.mockResolvedValue({ error: { code: "unexpected" } });
    const result = await signOutStaff(null, new FormData());
    expect(result).toEqual({ ok: false, error: "Odjava nije uspela. Pokušajte ponovo." });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
