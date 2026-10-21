import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  cookieSet: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
  getSessionKind: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getSessionKind: mocks.getSessionKind,
}));

import { signIn } from "@/app/actions/auth";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE_SECONDS } from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const valid = { email: "Vlasnik@Example.com", password: "lozinka" };

function cookieCall(name: string) {
  return mocks.cookieSet.mock.calls.find(([cookieName]) => cookieName === name);
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockClear());
  mocks.createClient.mockResolvedValue({
    auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
  });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("signIn", () => {
  it("returns field errors without calling Supabase", async () => {
    const result = await signIn(null, form({ email: "", password: "" }));
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { email: ["Unesite mejl."], password: ["Unesite lozinku."] },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports wrong credentials and writes no cookies", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400 } });
    const result = await signIn(null, form(valid));
    expect(result).toEqual({ ok: false, error: "Pogrešan mejl ili lozinka." });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends the normalized email to Supabase", async () => {
    mocks.getSessionKind.mockResolvedValue("staff");
    await expect(signIn(null, form(valid))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "vlasnik@example.com",
      password: "lozinka",
    });
  });

  it("keeps staff for 90 days with 'Zapamti me' and redirects to /danas", async () => {
    mocks.getSessionKind.mockResolvedValue("staff");
    await expect(signIn(null, form({ ...valid, remember: "on" }))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.createClient).toHaveBeenCalledWith({ remember: true });
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("staff");
    expect(cookieCall(SESSION_GATE_COOKIE)?.[2].maxAge).toBe(REMEMBER_MAX_AGE_SECONDS);
    expect(cookieCall(REMEMBER_COOKIE)?.[1]).toBe("1");
  });

  it("ends the session with the browser without 'Zapamti me'", async () => {
    mocks.getSessionKind.mockResolvedValue("staff");
    await expect(signIn(null, form(valid))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.createClient).toHaveBeenCalledWith({ remember: false });
    expect(cookieCall(SESSION_GATE_COOKIE)?.[2].maxAge).toBeUndefined();
    expect(cookieCall(REMEMBER_COOKIE)?.[1]).toBe("0");
  });

  it("sends the platform account to /platforma", async () => {
    mocks.getSessionKind.mockResolvedValue("platform");
    await expect(signIn(null, form(valid))).rejects.toThrow("REDIRECT:/platforma");
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("platform");
  });

  it("does not let a patient-only account into the calendar", async () => {
    mocks.getSessionKind.mockResolvedValue("patient");
    const result = await signIn(null, form(valid));
    expect(result).toEqual({ ok: false, error: "Ovaj nalog nije nalog osoblja ordinacije." });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("");
    expect(cookieCall(SESSION_GATE_COOKIE)?.[2].maxAge).toBe(0);
    expect(cookieCall(REMEMBER_COOKIE)).toBeUndefined();
  });

  it("signs out and asks to retry when the role lookup fails", async () => {
    mocks.getSessionKind.mockResolvedValue("unknown");
    const result = await signIn(null, form(valid));
    expect(result).toEqual({ ok: false, error: "Prijava trenutno nije moguća. Pokušajte ponovo." });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reports rate limiting in Serbian", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "over_request_rate_limit", status: 429 } });
    const result = await signIn(null, form(valid));
    expect(result).toEqual({
      ok: false,
      error: "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.",
    });
  });

  it("never throws a technical error at the user", async () => {
    mocks.signInWithPassword.mockRejectedValue(new Error("network down"));
    const result = await signIn(null, form(valid));
    expect(result).toEqual({ ok: false, error: "Prijava trenutno nije moguća. Pokušajte ponovo." });
  });
});
