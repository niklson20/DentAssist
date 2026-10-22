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
  createConfirmedUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  findClinicInviteUser: vi.fn(),
  setUserPassword: vi.fn(),
  readClinicInvite: vi.fn(),
  recordClinicInviteFailure: vi.fn(),
  storeClinicInviteResend: vi.fn(),
  revertClinicInviteResend: vi.fn(),
  acceptClinicInviteMembership: vi.fn(),
  readStaffInvite: vi.fn(),
  findStaffInviteUser: vi.fn(),
  recordStaffInviteFailure: vi.fn(),
  storeStaffInviteResend: vi.fn(),
  revertStaffInviteResend: vi.fn(),
  acceptStaffInviteMembership: vi.fn(),
  sendMail: vi.fn(),
  supabaseCreateClient: vi.fn(),
  rpc: vi.fn(),
  adminCreateUser: vi.fn(),
  adminUpdateUserById: vi.fn(),
  adminDeleteUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
  headers: async () => ({ get: (name: string) => mocks.headerGet(name) }),
}));
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: mocks.supabaseCreateClient,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createRecoveryToken: mocks.createRecoveryToken,
  createConfirmedUser: mocks.createConfirmedUser,
  deleteAuthUser: mocks.deleteAuthUser,
  findClinicInviteUser: mocks.findClinicInviteUser,
  setUserPassword: mocks.setUserPassword,
  readClinicInvite: mocks.readClinicInvite,
  recordClinicInviteFailure: mocks.recordClinicInviteFailure,
  storeClinicInviteResend: mocks.storeClinicInviteResend,
  revertClinicInviteResend: mocks.revertClinicInviteResend,
  acceptClinicInviteMembership: mocks.acceptClinicInviteMembership,
  readStaffInvite: mocks.readStaffInvite,
  findStaffInviteUser: mocks.findStaffInviteUser,
  recordStaffInviteFailure: mocks.recordStaffInviteFailure,
  storeStaffInviteResend: mocks.storeStaffInviteResend,
  revertStaffInviteResend: mocks.revertStaffInviteResend,
  acceptStaffInviteMembership: mocks.acceptStaffInviteMembership,
}));
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

import {
  acceptClinicInvite,
  acceptStaffInvite,
  requestPasswordReset,
  resendClinicInvite,
  resendStaffInvite,
  setNewPassword,
  signIn,
} from "@/app/actions/auth";
import {
  clinicInviteText,
  hashInviteCode,
  hashInviteToken,
  staffInviteText,
  verifyInviteCode,
} from "@/lib/clinic-invite";
import { MailError } from "@/lib/mail";
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

describe("clinic invite", () => {
  const pepper = "test-pepper";
  const token = "invite-token";
  const tokenHash = hashInviteToken(token, pepper);
  const inviteForm = {
    token,
    clinicName: "Ordinacija Jovanović",
    firstName: "Ana",
    lastName: "Jović",
    code: "123456",
    password: "lozinka-1",
  };
  let codeHash = "";

  beforeEach(async () => {
    vi.stubEnv("TOKEN_PEPPER", pepper);
    vi.stubEnv("STAFF_URL", "https://dent.dentassist.rs");
    mocks.headerGet.mockImplementation((name: string) => (name === "origin" ? "http://localhost:3000" : null));
    if (!codeHash) {
      codeHash = await hashInviteCode("123456");
    }
    mocks.readClinicInvite.mockResolvedValue({
      status: "ready",
      email: "Vlasnik@Example.com",
      codeHash,
    });
    mocks.recordClinicInviteFailure.mockResolvedValue({ status: "wrong" });
    mocks.createConfirmedUser.mockResolvedValue({ status: "ok", userId: "user-1" });
    mocks.deleteAuthUser.mockResolvedValue(undefined);
    mocks.findClinicInviteUser.mockResolvedValue({ status: "ok", userId: "user-2" });
    mocks.setUserPassword.mockResolvedValue({ status: "ok" });
    mocks.acceptClinicInviteMembership.mockResolvedValue({ status: "ok" });
    mocks.storeClinicInviteResend.mockResolvedValue({
      status: "ok",
      email: "vlasnik@example.com",
      previousCodeHash: codeHash,
      previousSendCount: 1,
      previousLastSentAt: null,
    });
    mocks.revertClinicInviteResend.mockResolvedValue(true);
    mocks.sendMail.mockResolvedValue(undefined);
    mocks.getSessionKind.mockResolvedValue("staff");
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a short code without reading the invite", async () => {
    const result = await acceptClinicInvite(null, form({ ...inviteForm, code: "12" }));
    expect(result.ok).toBe(false);
    expect(mocks.readClinicInvite).not.toHaveBeenCalled();
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("does not call the database when the pepper is missing", async () => {
    vi.stubEnv("TOKEN_PEPPER", "");
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({
      ok: false,
      error: "Pozivnica trenutno ne može da se otvori. Pokušajte ponovo.",
    });
    expect(mocks.readClinicInvite).not.toHaveBeenCalled();
  });

  it("counts a wrong code and does not create a user", async () => {
    const result = await acceptClinicInvite(null, form({ ...inviteForm, code: "000000" }));
    expect(result).toEqual({
      ok: false,
      error: "Pogrešan kod.",
      fieldErrors: { code: ["Pogrešan kod."] },
    });
    expect(mocks.recordClinicInviteFailure).toHaveBeenCalledWith(tokenHash);
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("retires the link after the fifth wrong code", async () => {
    mocks.recordClinicInviteFailure.mockResolvedValue({ status: "invalid" });
    const result = await acceptClinicInvite(null, form({ ...inviteForm, code: "000000" }));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("opens the clinic, signs the owner in for this browser session, and goes to /danas", async () => {
    await expect(acceptClinicInvite(null, form(inviteForm))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.readClinicInvite).toHaveBeenCalledWith(tokenHash);
    expect(mocks.createConfirmedUser).toHaveBeenCalledWith("vlasnik@example.com", "lozinka-1");
    expect(mocks.acceptClinicInviteMembership).toHaveBeenCalledWith({
      tokenHash,
      codeHash,
      userId: "user-1",
      firstName: "Ana",
      lastName: "Jović",
      clinicName: "Ordinacija Jovanović",
    });
    expect(mocks.createClient).toHaveBeenCalledWith({ remember: false });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "vlasnik@example.com",
      password: "lozinka-1",
    });
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("staff");
    expect(cookieCall(SESSION_GATE_COOKIE)?.[2].maxAge).toBeUndefined();
    expect(cookieCall(REMEMBER_COOKIE)?.[1]).toBe("0");
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("deletes the new auth user when the clinic cannot be opened", async () => {
    mocks.acceptClinicInviteMembership.mockResolvedValue({ status: "invalid" });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("user-1");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps an account that is already a member", async () => {
    mocks.acceptClinicInviteMembership.mockResolvedValue({ status: "already_member" });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Ovaj mejl već ima nalog." });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("makes an account that already exists the owner and stores this password", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    await expect(acceptClinicInvite(null, form(inviteForm))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.findClinicInviteUser).toHaveBeenCalledWith(tokenHash);
    expect(mocks.acceptClinicInviteMembership).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-2" }),
    );
    expect(mocks.setUserPassword).toHaveBeenCalledWith("user-2", "lozinka-1");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "vlasnik@example.com",
      password: "lozinka-1",
    });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("leaves the password of an account that already belongs to a clinic", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    mocks.acceptClinicInviteMembership.mockResolvedValue({ status: "already_member" });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Ovaj mejl već ima nalog." });
    expect(mocks.setUserPassword).not.toHaveBeenCalled();
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("does not delete an account it did not create when the clinic cannot be opened", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    mocks.acceptClinicInviteMembership.mockResolvedValue({ status: "invalid" });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(mocks.setUserPassword).not.toHaveBeenCalled();
  });

  it("keeps the open clinic when the password could not be stored", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    mocks.setUserPassword.mockResolvedValue({ status: "failed" });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Nalog je otvoren. Prijavite se." });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("asks for another password without opening the clinic", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "weak_password" });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({
      ok: false,
      error: "Izaberite drugu lozinku.",
      fieldErrors: { password: ["Izaberite drugu lozinku."] },
    });
    expect(mocks.acceptClinicInviteMembership).not.toHaveBeenCalled();
  });

  it("tells the owner to sign in when the session cannot be stored", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "unexpected", status: 500 } });
    const result = await acceptClinicInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Nalog je otvoren. Prijavite se." });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("mails a new code on STAFF_URL and stores the matching hash", async () => {
    const result = await resendClinicInvite(null, form({ token }));
    expect(result).toEqual({ ok: true, data: { sent: true } });
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    const code = mail.text.match(/Kod: (\d{6})/)?.[1] ?? "";
    const storedHash = mocks.storeClinicInviteResend.mock.calls[0]?.[1] as string;
    expect(mail.to).toBe("vlasnik@example.com");
    expect(mail.subject).toBe("Otvorite ordinaciju");
    expect(mail.text).toBe(clinicInviteText("https://dent.dentassist.rs/poziv/invite-token", code));
    expect(mocks.storeClinicInviteResend).toHaveBeenCalledWith(tokenHash, storedHash);
    expect(await verifyInviteCode(storedHash, code)).toBe(true);
    expect(mocks.revertClinicInviteResend).not.toHaveBeenCalled();
  });

  it("does not mint a new code when the link is dead", async () => {
    mocks.readClinicInvite.mockResolvedValue({ status: "invalid" });
    const result = await resendClinicInvite(null, form({ token }));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.storeClinicInviteResend).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("stops at three resends an hour", async () => {
    mocks.storeClinicInviteResend.mockResolvedValue({ status: "rate_limit" });
    const result = await resendClinicInvite(null, form({ token }));
    expect(result).toEqual({
      ok: false,
      error: "Kod može da se pošalje najviše tri puta na sat.",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("restores the previous code when the mail fails", async () => {
    mocks.sendMail.mockRejectedValue(new MailError("rate_limit_exceeded"));
    const result = await resendClinicInvite(null, form({ token }));
    expect(result).toEqual({
      ok: false,
      error: "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.",
    });
    expect(mocks.revertClinicInviteResend).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash,
        previousCodeHash: codeHash,
        previousSendCount: 1,
        previousLastSentAt: null,
      }),
    );
  });

  it("uses the current origin when STAFF_URL is unset", async () => {
    vi.stubEnv("STAFF_URL", "");
    const result = await resendClinicInvite(null, form({ token }));
    expect(result.ok).toBe(true);
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text.startsWith("Link važi 7 dana: http://localhost:3000/poziv/invite-token.")).toBe(true);
  });
});

describe("staff invite", () => {
  const pepper = "test-pepper";
  const token = "staff-token";
  const tokenHash = hashInviteToken(token, pepper);
  const inviteForm = { token, code: "123456", password: "lozinka-1" };
  let codeHash = "";

  beforeEach(async () => {
    vi.stubEnv("TOKEN_PEPPER", pepper);
    vi.stubEnv("STAFF_URL", "https://dent.dentassist.rs");
    mocks.headerGet.mockImplementation((name: string) => (name === "origin" ? "http://localhost:3000" : null));
    if (!codeHash) {
      codeHash = await hashInviteCode("123456");
    }
    mocks.readStaffInvite.mockResolvedValue({
      status: "ready",
      email: "Kolega@Example.com",
      codeHash,
      role: "dentist",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
    });
    mocks.recordStaffInviteFailure.mockResolvedValue({ status: "wrong" });
    mocks.createConfirmedUser.mockResolvedValue({ status: "ok", userId: "user-1" });
    mocks.deleteAuthUser.mockResolvedValue(undefined);
    mocks.findStaffInviteUser.mockResolvedValue({ status: "ok", userId: "user-2" });
    mocks.setUserPassword.mockResolvedValue({ status: "ok" });
    mocks.acceptStaffInviteMembership.mockResolvedValue({ status: "ok" });
    mocks.storeStaffInviteResend.mockResolvedValue({
      status: "ok",
      email: "kolega@example.com",
      role: "reception",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
      previousCodeHash: codeHash,
      previousSendCount: 1,
      previousLastSentAt: null,
    });
    mocks.revertStaffInviteResend.mockResolvedValue(true);
    mocks.sendMail.mockResolvedValue(undefined);
    mocks.getSessionKind.mockResolvedValue("staff");
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a short code without reading the invite", async () => {
    const result = await acceptStaffInvite(null, form({ ...inviteForm, code: "12" }));
    expect(result.ok).toBe(false);
    expect(mocks.readStaffInvite).not.toHaveBeenCalled();
    expect(mocks.readClinicInvite).not.toHaveBeenCalled();
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("does not call the database when the pepper is missing", async () => {
    vi.stubEnv("TOKEN_PEPPER", "");
    const result = await acceptStaffInvite(null, form(inviteForm));
    expect(result).toEqual({
      ok: false,
      error: "Pozivnica trenutno ne može da se otvori. Pokušajte ponovo.",
    });
    expect(mocks.readStaffInvite).not.toHaveBeenCalled();
  });

  it("counts a wrong code and does not create a user", async () => {
    const result = await acceptStaffInvite(null, form({ ...inviteForm, code: "000000" }));
    expect(result).toEqual({
      ok: false,
      error: "Pogrešan kod.",
      fieldErrors: { code: ["Pogrešan kod."] },
    });
    expect(mocks.recordStaffInviteFailure).toHaveBeenCalledWith(tokenHash);
    expect(mocks.recordClinicInviteFailure).not.toHaveBeenCalled();
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("retires the link after the fifth wrong code", async () => {
    mocks.recordStaffInviteFailure.mockResolvedValue({ status: "invalid" });
    const result = await acceptStaffInvite(null, form({ ...inviteForm, code: "000000" }));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
  });

  it("joins the clinic as the role stored on the invite and goes to /danas", async () => {
    await expect(acceptStaffInvite(null, form(inviteForm))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.readStaffInvite).toHaveBeenCalledWith(tokenHash);
    expect(mocks.acceptClinicInviteMembership).not.toHaveBeenCalled();
    expect(mocks.createConfirmedUser).toHaveBeenCalledWith("kolega@example.com", "lozinka-1");
    expect(mocks.acceptStaffInviteMembership).toHaveBeenCalledWith({
      tokenHash,
      codeHash,
      userId: "user-1",
    });
    expect(mocks.createClient).toHaveBeenCalledWith({ remember: false });
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("staff");
    expect(cookieCall(REMEMBER_COOKIE)?.[1]).toBe("0");
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("deletes the new auth user when the membership cannot be opened", async () => {
    mocks.acceptStaffInviteMembership.mockResolvedValue({ status: "invalid" });
    const result = await acceptStaffInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("user-1");
  });

  it("keeps an account that is already a member", async () => {
    mocks.acceptStaffInviteMembership.mockResolvedValue({ status: "already_member" });
    const result = await acceptStaffInvite(null, form(inviteForm));
    expect(result).toEqual({ ok: false, error: "Ovaj mejl već ima nalog." });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(mocks.setUserPassword).not.toHaveBeenCalled();
  });

  it("joins an existing account and stores this password", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    await expect(acceptStaffInvite(null, form(inviteForm))).rejects.toThrow("REDIRECT:/danas");
    expect(mocks.findStaffInviteUser).toHaveBeenCalledWith(tokenHash);
    expect(mocks.acceptStaffInviteMembership).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-2" }),
    );
    expect(mocks.setUserPassword).toHaveBeenCalledWith("user-2", "lozinka-1");
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("asks for another password without joining the clinic", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "weak_password" });
    const result = await acceptStaffInvite(null, form(inviteForm));
    expect(result).toEqual({
      ok: false,
      error: "Izaberite drugu lozinku.",
      fieldErrors: { password: ["Izaberite drugu lozinku."] },
    });
    expect(mocks.acceptStaffInviteMembership).not.toHaveBeenCalled();
  });

  it("mails Poziv u {ordinacija} for the role stored on the invite", async () => {
    const result = await resendStaffInvite(null, form({ token }));
    expect(result).toEqual({ ok: true, data: { sent: true } });
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    const code = mail.text.match(/Kod: (\d{6})/)?.[1] ?? "";
    const storedHash = mocks.storeStaffInviteResend.mock.calls[0]?.[1] as string;
    expect(mail.to).toBe("kolega@example.com");
    expect(mail.subject).toBe("Poziv u Ordinacija Jovanović");
    expect(mail.text).toBe(
      staffInviteText({
        inviterName: "Ana Jović",
        roleLabel: "recepcija",
        link: "https://dent.dentassist.rs/poziv/staff-token",
        code,
      }),
    );
    expect(mocks.storeClinicInviteResend).not.toHaveBeenCalled();
    expect(await verifyInviteCode(storedHash, code)).toBe(true);
    expect(mocks.revertStaffInviteResend).not.toHaveBeenCalled();
  });

  it("mails a dentist with the dentist role", async () => {
    mocks.storeStaffInviteResend.mockResolvedValue({
      status: "ok",
      email: "kolega@example.com",
      role: "dentist",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
      previousCodeHash: codeHash,
      previousSendCount: 0,
      previousLastSentAt: null,
    });
    const result = await resendStaffInvite(null, form({ token }));
    expect(result.ok).toBe(true);
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { text: string };
    expect(mail.text.startsWith("Ana Jović vas poziva kao stomatolog.")).toBe(true);
  });

  it("does not mint a new code when the link is dead", async () => {
    mocks.readStaffInvite.mockResolvedValue({ status: "invalid" });
    const result = await resendStaffInvite(null, form({ token }));
    expect(result).toEqual({ ok: false, error: "Ovaj link više ne važi." });
    expect(mocks.storeStaffInviteResend).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("stops at three resends an hour", async () => {
    mocks.storeStaffInviteResend.mockResolvedValue({ status: "rate_limit" });
    const result = await resendStaffInvite(null, form({ token }));
    expect(result).toEqual({
      ok: false,
      error: "Kod može da se pošalje najviše tri puta na sat.",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("restores the previous code when the mail fails", async () => {
    mocks.sendMail.mockRejectedValue(new MailError("rate_limit_exceeded"));
    const result = await resendStaffInvite(null, form({ token }));
    expect(result).toEqual({
      ok: false,
      error: "Previše pokušaja. Pokušajte ponovo za nekoliko minuta.",
    });
    expect(mocks.revertStaffInviteResend).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash,
        previousCodeHash: codeHash,
        previousSendCount: 1,
        previousLastSentAt: null,
      }),
    );
  });
});

describe("clinic invite keys", () => {
  const tokenHash = "a".repeat(64);
  const publishableKey = "publishable-key";
  const serviceKey = "service-role-key";
  let admin: typeof import("@/lib/supabase/admin");

  beforeEach(async () => {
    admin = await vi.importActual<typeof import("@/lib/supabase/admin")>("@/lib/supabase/admin");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", serviceKey);
    mocks.supabaseCreateClient.mockReturnValue({
      rpc: mocks.rpc,
      auth: {
        admin: {
          createUser: mocks.adminCreateUser,
          updateUserById: mocks.adminUpdateUserById,
          deleteUser: mocks.adminDeleteUser,
        },
      },
    });
    mocks.rpc.mockResolvedValue({ data: { status: "invalid" }, error: null });
    mocks.adminCreateUser.mockResolvedValue({ data: { user: { id: "user-3" } }, error: null });
    mocks.adminUpdateUserById.mockResolvedValue({ error: null });
    mocks.adminDeleteUser.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function keysUsed(): unknown[] {
    return mocks.supabaseCreateClient.mock.calls.map(([, key]) => key);
  }

  it("calls every invite function with the publishable key and no session", async () => {
    await admin.readClinicInvite(tokenHash);
    await admin.recordClinicInviteFailure(tokenHash);
    await admin.storeClinicInviteResend(tokenHash, "code-hash");
    await admin.revertClinicInviteResend({
      tokenHash,
      previousCodeHash: "old-hash",
      newCodeHash: "code-hash",
      previousSendCount: 1,
      previousLastSentAt: null,
    });
    await admin.acceptClinicInviteMembership({
      tokenHash,
      codeHash: "code-hash",
      userId: "user-2",
      firstName: "Ana",
      lastName: "Jović",
      clinicName: "Ordinacija Jovanović",
    });
    await admin.findClinicInviteUser(tokenHash);

    expect(mocks.rpc.mock.calls.map(([fn]) => fn)).toEqual([
      "read_clinic_invite",
      "record_clinic_invite_failure",
      "resend_clinic_invite",
      "revert_clinic_invite_resend",
      "accept_clinic_invite",
      "clinic_invite_user_id",
    ]);
    expect(keysUsed()).toEqual(Array.from({ length: 6 }, () => publishableKey));
    expect(mocks.supabaseCreateClient).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      publishableKey,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });

  it("keeps the service key for the Auth admin API only", async () => {
    await admin.createConfirmedUser("vlasnik@example.com", "lozinka-1");
    await admin.setUserPassword("user-3", "lozinka-1");
    await admin.deleteAuthUser("user-3");

    expect(keysUsed()).toEqual(Array.from({ length: 3 }, () => serviceKey));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminCreateUser).toHaveBeenCalledWith({
      email: "vlasnik@example.com",
      password: "lozinka-1",
      email_confirm: true,
    });
    expect(mocks.adminUpdateUserById).toHaveBeenCalledWith("user-3", {
      password: "lozinka-1",
      email_confirm: true,
    });
    expect(mocks.adminDeleteUser).toHaveBeenCalledWith("user-3");
  });

  it("calls every staff invite function with the publishable key and no session", async () => {
    mocks.rpc.mockClear();
    mocks.supabaseCreateClient.mockClear();
    await admin.readStaffInvite(tokenHash);
    await admin.recordStaffInviteFailure(tokenHash);
    await admin.storeStaffInviteResend(tokenHash, "code-hash");
    await admin.revertStaffInviteResend({
      tokenHash,
      previousCodeHash: "old-hash",
      newCodeHash: "code-hash",
      previousSendCount: 1,
      previousLastSentAt: null,
    });
    await admin.acceptStaffInviteMembership({
      tokenHash,
      codeHash: "code-hash",
      userId: "user-2",
    });
    await admin.findStaffInviteUser(tokenHash);

    expect(mocks.rpc.mock.calls.map(([fn]) => fn)).toEqual([
      "read_staff_invite",
      "record_staff_invite_failure",
      "resend_staff_invite",
      "revert_staff_invite_resend",
      "accept_staff_invite",
      "staff_invite_user_id",
    ]);
    expect(mocks.supabaseCreateClient.mock.calls.map(([, key]) => key)).toEqual(
      Array.from({ length: 6 }, () => publishableKey),
    );
  });
});
