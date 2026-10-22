import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  cookieSet: vi.fn(),
  headerGet: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  getUser: vi.fn(),
  createClient: vi.fn(),
  getSessionKind: vi.fn(),
  createRecoveryToken: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
  headers: async () => ({ get: (name: string) => mocks.headerGet(name) }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createRecoveryToken: mocks.createRecoveryToken }));
vi.mock("@/lib/mail", () => ({
  sendMail: mocks.sendMail,
  MailError: class MailError extends Error {
    readonly code: string;
    constructor(code: string) {
      super("sendMail failed");
      this.name = "MailError";
      this.code = code;
    }
  },
}));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getSessionKind: mocks.getSessionKind,
}));

import { requestPasswordReset, setNewPassword, signIn } from "@/app/actions/auth";
import { passwordResetText, PASSWORD_RESET_SUBJECT } from "@/lib/password-reset";
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

describe("requestPasswordReset", () => {
  const staffUrl = "https://dent.dentassist.rs";
  const appUrl = "https://dentassist.rs";

  beforeEach(() => {
    vi.stubEnv("STAFF_URL", staffUrl);
    vi.stubEnv("APP_URL", appUrl);
    mocks.headerGet.mockImplementation((name: string) => (name === "origin" ? "http://localhost:3000" : null));
    mocks.createRecoveryToken.mockResolvedValue({ status: "ok", token: "token-1" });
    mocks.sendMail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a bad email without issuing a link", async () => {
    const result = await requestPasswordReset(null, form({ email: "", audience: "staff" }));
    expect(result.ok).toBe(false);
    expect(mocks.createRecoveryToken).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("mails a one-hour staff link on STAFF_URL", async () => {
    const result = await requestPasswordReset(null, form({ email: "Vlasnik@Example.com", audience: "staff" }));
    const link = `${staffUrl}/lozinka/token-1`;
    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.createRecoveryToken).toHaveBeenCalledWith("vlasnik@example.com");
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "vlasnik@example.com",
      subject: PASSWORD_RESET_SUBJECT,
      text: passwordResetText(link),
    });
  });

  it("mails a patient link on APP_URL and keeps a valid clinic slug", async () => {
    const result = await requestPasswordReset(
      null,
      form({ email: "pacijent@example.com", audience: "patient", clinicSlug: "Centar" }),
    );
    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "pacijent@example.com",
      subject: "Nova lozinka",
      text: passwordResetText(`${appUrl}/lozinka/token-1?ordinacija=centar`),
    });
  });

  it("drops a slug that is not a clinic path", async () => {
    await requestPasswordReset(
      null,
      form({ email: "pacijent@example.com", audience: "patient", clinicSlug: "https://evil.example" }),
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: passwordResetText(`${appUrl}/lozinka/token-1`),
      }),
    );
  });

  it("uses the current origin when the audience URL is unset", async () => {
    vi.stubEnv("STAFF_URL", "");
    const result = await requestPasswordReset(null, form({ email: "a@b.rs", audience: "staff" }));
    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: passwordResetText("http://localhost:3000/lozinka/token-1"),
      }),
    );
  });

  it("returns the same success when the account does not exist", async () => {
    mocks.createRecoveryToken.mockResolvedValue({ status: "missing" });
    const result = await requestPasswordReset(null, form({ email: "nema@example.com", audience: "staff" }));
    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("does not mint a token when no absolute origin exists", async () => {
    vi.stubEnv("STAFF_URL", "");
    vi.stubEnv("APP_URL", "");
    mocks.headerGet.mockReturnValue(null);
    const result = await requestPasswordReset(null, form({ email: "a@b.rs", audience: "staff" }));
    expect(result).toEqual({ ok: false, error: "Slanje trenutno nije moguće. Pokušajte ponovo." });
    expect(mocks.createRecoveryToken).not.toHaveBeenCalled();
  });
});

describe("setNewPassword", () => {
  beforeEach(() => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: mocks.signInWithPassword,
        signOut: mocks.signOut,
        verifyOtp: mocks.verifyOtp,
        updateUser: mocks.updateUser,
        getUser: mocks.getUser,
      },
    });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("asks for a password without calling Supabase", async () => {
    const result = await setNewPassword(null, form({ token: "token-1", password: "" }));
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { password: ["Unesite lozinku."] },
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    const result = await setNewPassword(null, form({ token: "spent", password: "nova-lozinka" }));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs staff out and returns them to login", async () => {
    mocks.getSessionKind.mockResolvedValue("staff");
    await expect(setNewPassword(null, form({ token: "token-1", password: "nova-lozinka" }))).rejects.toThrow(
      "REDIRECT:/prijava",
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "token-1", type: "recovery" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "nova-lozinka" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("");
    expect(cookieCall(SESSION_GATE_COOKIE)?.[2].maxAge).toBe(0);
  });

  it("sends a patient back to that clinic login", async () => {
    mocks.getSessionKind.mockResolvedValue("patient");
    await expect(
      setNewPassword(null, form({ token: "token-1", password: "nova-lozinka", clinicSlug: "centar" })),
    ).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("confirms the save when a patient has no clinic slug", async () => {
    mocks.getSessionKind.mockResolvedValue("patient");
    const result = await setNewPassword(null, form({ token: "token-1", password: "nova-lozinka" }));
    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps the recovery session when Supabase rejects the password", async () => {
    mocks.updateUser.mockResolvedValue({ error: { code: "weak_password", status: 422 } });
    const result = await setNewPassword(null, form({ token: "token-1", password: "kratko" }));
    expect(result).toEqual({
      ok: false,
      error: "Izaberite drugu lozinku.",
      fieldErrors: { password: ["Izaberite drugu lozinku."] },
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("retries the password when the token was already verified", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403 } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getSessionKind.mockResolvedValue("platform");
    await expect(setNewPassword(null, form({ token: "token-1", password: "nova-lozinka" }))).rejects.toThrow(
      "REDIRECT:/prijava",
    );
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "nova-lozinka" });
  });
});
