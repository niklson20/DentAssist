import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
  cookieGetAll: vi.fn(() => [] as { name: string; value: string }[]),
  headerGet: vi.fn(),
  createClient: vi.fn(),
  createConfirmedUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  sendMail: vi.fn(),
  getSessionKind: vi.fn(),
  loadClinicPublic: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: mocks.cookieSet,
    get: mocks.cookieGet,
    getAll: mocks.cookieGetAll,
  }),
  headers: async () => ({ get: (name: string) => mocks.headerGet(name) }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createConfirmedUser: mocks.createConfirmedUser,
  deleteAuthUser: mocks.deleteAuthUser,
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
vi.mock("@/app/ordinacije/[slug]/load-clinic-public", () => ({
  loadClinicPublic: mocks.loadClinicPublic,
}));

import {
  confirmPatientEmail,
  registerPatient,
  resendPatientEmailCode,
  signInPatient,
  signOutPatient,
} from "@/app/actions/patient-auth";
import { patientAuthPath, patientReturnPath } from "@/lib/auth";
import { verifyInviteCode } from "@/lib/clinic-invite";
import { MailError } from "@/lib/mail";
import { SESSION_GATE_COOKIE } from "@/proxy";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";
const ipHash = createHmac("sha256", "pepper").update("127.0.0.1").digest("hex");

type Account = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
} | null;

const db = {
  user: null as { id: string; email: string } | null,
  account: null as Account,
  insertError: null as { code?: string; message: string } | null,
  signInError: null as { code?: string; status?: number } | null,
  signOutError: null as { code?: string; status?: number } | null,
  signOutScope: null as string | null,
  tables: [] as string[],
  rpcs: [] as { name: string; args: Record<string, unknown> }[],
  quota: { status: "ok", email_sends: 0, network_sends: 0 } as Record<string, unknown>,
  startStatus: "ok",
  confirmStatus: "ok",
};

function client() {
  return {
    auth: {
      getUser: async () =>
        db.user
          ? { data: { user: db.user }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
      signInWithPassword: async ({ email }: { email: string }) => {
        if (db.signInError) {
          return { error: db.signInError };
        }
        db.user = { id: "user-1", email };
        return { error: null };
      },
      signOut: async (options?: { scope?: string }) => {
        db.signOutScope = options?.scope ?? null;
        if (db.signOutError) {
          return { error: db.signOutError };
        }
        db.user = null;
        return { error: null };
      },
    },
    from(table: string) {
      db.tables.push(table);
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: db.account, error: null }),
              };
            },
          };
        },
        insert(row: { user_id: string; email: string; first_name: string; last_name: string }) {
          return {
            select() {
              return {
                maybeSingle: async () => {
                  if (db.insertError) {
                    return { data: null, error: db.insertError };
                  }
                  db.account = {
                    id: "acc-1",
                    email: row.email,
                    email_confirmed_at: null,
                  };
                  return { data: db.account, error: null };
                },
              };
            },
          };
        },
      };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpcs.push({ name, args });
      if (name === "patient_email_challenge_quota") {
        return { data: db.quota, error: null };
      }
      if (name === "start_patient_email_challenge") {
        return { data: { status: db.startStatus }, error: null };
      }
      if (name === "abandon_patient_email_challenge") {
        return { data: { status: "ok" }, error: null };
      }
      if (name === "confirm_patient_email") {
        return { data: { status: db.confirmStatus }, error: null };
      }
      return { data: null, error: { code: "unexpected", message: name } };
    },
  };
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const registerFields = {
  firstName: "Ana",
  lastName: "Jović",
  email: "Ana@Example.com",
  password: "lozinka-1",
  slug: "centar",
};

function rpcNamed(name: string) {
  return db.rpcs.find((call) => call.name === name);
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockClear());
  db.user = null;
  db.account = null;
  db.insertError = null;
  db.signInError = null;
  db.signOutError = null;
  db.signOutScope = null;
  db.tables = [];
  db.rpcs = [];
  db.quota = { status: "ok", email_sends: 0, network_sends: 0 };
  db.startStatus = "ok";
  db.confirmStatus = "ok";
  mocks.createClient.mockImplementation(async () => client());
  mocks.createConfirmedUser.mockResolvedValue({ status: "ok", userId: "user-1" });
  mocks.deleteAuthUser.mockResolvedValue(undefined);
  mocks.sendMail.mockResolvedValue(undefined);
  mocks.getSessionKind.mockResolvedValue("patient");
  mocks.loadClinicPublic.mockResolvedValue({ status: "ready", clinic: { slug: "centar" } });
  mocks.cookieGetAll.mockReturnValue([]);
  mocks.headerGet.mockImplementation((name: string) => (name === "host" ? "localhost:3000" : null));
  vi.stubEnv("TOKEN_PEPPER", "pepper");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("patient registration", () => {
  it("creates the auth user, then confirms nothing until the code is stored and mailed", async () => {
    const result = await registerPatient(null, form(registerFields));

    expect(result).toEqual({ ok: true, data: { step: "code" } });
    expect(mocks.createConfirmedUser).toHaveBeenCalledWith("ana@example.com", "lozinka-1");
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(db.tables.every((table) => table === "patient_accounts")).toBe(true);
    expect(db.account).toMatchObject({ email: "ana@example.com", email_confirmed_at: null });

    const mail = mocks.sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    const code = mail.text.match(/je (\d{6})\./)?.[1] ?? "";
    expect(mail).toEqual({
      to: "ana@example.com",
      subject: "Potvrdite mejl",
      text: `Kod za potvrdu mejla je ${code}. Važi 10 minuta. Ako niste vi otvorili nalog, zanemarite poruku.`,
    });
    const started = rpcNamed("start_patient_email_challenge");
    expect(started?.args.p_ip_hash).toBe(ipHash);
    expect(await verifyInviteCode(String(started?.args.p_code_hash), code)).toBe(true);
    expect(await verifyInviteCode(String(started?.args.p_code_hash), code === "000000" ? "000001" : "000000")).toBe(
      false,
    );
    expect(rpcNamed("abandon_patient_email_challenge")).toBeUndefined();
  });

  it("creates a site-wide patient account without requiring a clinic", async () => {
    const result = await registerPatient(
      null,
      form({
        firstName: "Ana",
        lastName: "Jović",
        email: "Ana@Example.com",
        password: "lozinka-1",
      }),
    );

    expect(result).toEqual({ ok: true, data: { step: "code" } });
    expect(mocks.loadClinicPublic).not.toHaveBeenCalled();
    expect(db.account).toMatchObject({ email: "ana@example.com", email_confirmed_at: null });
  });

  it("does not start a challenge when the network already sent 10 codes", async () => {
    db.quota = { status: "ok", email_sends: 0, network_sends: 10 };
    const result = await registerPatient(null, form(registerFields));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.turnstile?.[0]).toBe("Potvrdite da niste robot.");
    }
    expect(rpcNamed("start_patient_email_challenge")).toBeUndefined();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(db.account?.email_confirmed_at).toBeNull();
  });

  it("sends after the captcha when the account already exists", async () => {
    db.user = { id: "user-1", email: "ana@example.com" };
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: null };
    db.quota = { status: "ok", email_sends: 1, network_sends: 10 };
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) })),
    );

    const result = await registerPatient(null, form({ ...registerFields, "cf-turnstile-response": "token-1" }));

    expect(result).toEqual({ ok: true, data: { step: "code" } });
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
    expect(rpcNamed("start_patient_email_challenge")).toBeDefined();
  });

  it("stops at three sends an hour", async () => {
    db.quota = { status: "ok", email_sends: 3, network_sends: 3 };
    const result = await registerPatient(null, form(registerFields));
    expect(result).toEqual({
      ok: false,
      error: "Kod može da se pošalje najviše tri puta na sat.",
    });
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(rpcNamed("start_patient_email_challenge")).toBeUndefined();
  });

  it("drops the unused challenge when the mail does not leave", async () => {
    mocks.sendMail.mockRejectedValue(new MailError("validation_error"));
    const result = await registerPatient(null, form(registerFields));
    expect(result).toEqual({
      ok: false,
      error: "Kod trenutno ne može da se pošalje. Pokušajte ponovo.",
    });
    const started = rpcNamed("start_patient_email_challenge");
    expect(rpcNamed("abandon_patient_email_challenge")?.args.p_code_hash).toBe(started?.args.p_code_hash);
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(db.user).toBeNull();
    expect(db.account?.email_confirmed_at).toBeNull();
  });

  it("removes the auth user when the patient row cannot be saved", async () => {
    db.insertError = { code: "42501", message: "permission denied" };
    const result = await registerPatient(null, form(registerFields));
    expect(result).toEqual({
      ok: false,
      error: "Registracija trenutno nije moguća. Pokušajte ponovo.",
    });
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("user-1");
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("signs in an existing mailbox instead of creating a second auth user", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    const result = await registerPatient(null, form(registerFields));
    expect(result.ok).toBe(true);
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(db.account?.email).toBe("ana@example.com");
  });

  it("does not take over an existing mailbox with the wrong password", async () => {
    mocks.createConfirmedUser.mockResolvedValue({ status: "exists" });
    db.signInError = { code: "invalid_credentials", status: 400 };
    const result = await registerPatient(null, form(registerFields));
    expect(result).toEqual({
      ok: false,
      error: "Ovaj mejl već ima nalog. Prijavite se.",
    });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
    expect(db.tables).toEqual([]);
  });
});

describe("patient email confirmation", () => {
  beforeEach(() => {
    db.user = { id: "user-1", email: "ana@example.com" };
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: null };
  });

  it("treats the correct code as confirmation and returns to the saved slot", async () => {
    db.confirmStatus = "ok";
    await expect(
      confirmPatientEmail(null, form({ code: "123456", slug: "centar", stomatolog: dentistId, pocetak: startsAt })),
    ).rejects.toThrow(
      `REDIRECT:${patientReturnPath("centar", { stomatolog: dentistId, pocetak: startsAt })}`,
    );
    expect(rpcNamed("confirm_patient_email")?.args).toEqual({ p_code: "123456" });
  });

  it("returns a confirmed site-wide account to the directory", async () => {
    await expect(confirmPatientEmail(null, form({ code: "123456" }))).rejects.toThrow("REDIRECT:/");
    expect(mocks.loadClinicPublic).not.toHaveBeenCalled();
  });

  it("does not confirm the account when the code is wrong", async () => {
    db.confirmStatus = "wrong";
    const result = await confirmPatientEmail(null, form({ code: "000000", slug: "centar" }));
    expect(result).toEqual({
      ok: false,
      error: "Pogrešan kod.",
      fieldErrors: { code: ["Pogrešan kod."] },
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("keeps a dead code from confirming the account", async () => {
    db.confirmStatus = "invalid";
    const result = await confirmPatientEmail(null, form({ code: "123456", slug: "centar" }));
    expect(result).toEqual({
      ok: false,
      error: "Kod više ne važi. Zatražite novi.",
      fieldErrors: { code: ["Kod više ne važi. Zatražite novi."] },
    });
  });
});

describe("patient sign-in", () => {
  it("returns a confirmed patient to the saved dentist and start", async () => {
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: "2026-10-22T10:00:00.000Z" };
    await expect(
      signInPatient(
        null,
        form({ email: "ana@example.com", password: "lozinka-1", slug: "centar", stomatolog: dentistId, pocetak: startsAt }),
      ),
    ).rejects.toThrow(`REDIRECT:${patientReturnPath("centar", { stomatolog: dentistId, pocetak: startsAt })}`);
    expect(mocks.cookieSet.mock.calls.find(([name]) => name === SESSION_GATE_COOKIE)?.[1]).toBe("patient");
  });

  it("sends an unconfirmed email to the code step instead of the request", async () => {
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: null };
    await expect(
      signInPatient(
        null,
        form({ email: "ana@example.com", password: "lozinka-1", slug: "centar", stomatolog: dentistId, pocetak: startsAt }),
      ),
    ).rejects.toThrow(
      `REDIRECT:${patientAuthPath("centar", "registracija", { stomatolog: dentistId, pocetak: startsAt })}`,
    );
  });

  it("returns to the clinic when no slot was saved", async () => {
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: "2026-10-22T10:00:00.000Z" };
    await expect(
      signInPatient(null, form({ email: "ana@example.com", password: "lozinka-1", slug: "centar" })),
    ).rejects.toThrow("REDIRECT:/ordinacije/centar");
  });

  it("returns a site-wide patient to the directory", async () => {
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: "2026-10-22T10:00:00.000Z" };
    await expect(
      signInPatient(null, form({ email: "ana@example.com", password: "lozinka-1" })),
    ).rejects.toThrow("REDIRECT:/");
    expect(mocks.loadClinicPublic).not.toHaveBeenCalled();
  });

  it("sends a site-wide unconfirmed patient to the code form", async () => {
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: null };
    await expect(
      signInPatient(null, form({ email: "ana@example.com", password: "lozinka-1" })),
    ).rejects.toThrow("REDIRECT:/nalog/registracija");
  });

  it("rejects a signed-in user who has no patient account", async () => {
    const result = await signInPatient(null, form({ email: "ana@example.com", password: "lozinka-1", slug: "centar" }));
    expect(result).toEqual({ ok: false, error: "Ovaj nalog nije nalog pacijenta." });
    expect(db.user).toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("reports a wrong password", async () => {
    db.signInError = { code: "invalid_credentials", status: 400 };
    const result = await signInPatient(null, form({ email: "ana@example.com", password: "pogresno", slug: "centar" }));
    expect(result).toEqual({ ok: false, error: "Pogrešan mejl ili lozinka." });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});

describe("patient auth files", () => {
  it("keeps service role on the auth user and keeps Supabase out of the pages", () => {
    const action = readFileSync(path.join(process.cwd(), "app/actions/patient-auth.ts"), "utf8");
    const loginPage = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/prijava/page.tsx"), "utf8");
    const loginForm = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/prijava/login-form.tsx"), "utf8");
    const registerPage = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/registracija/page.tsx"),
      "utf8",
    );
    const registerForm = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/registracija/register-form.tsx"),
      "utf8",
    );

    expect(action).toContain("createConfirmedUser");
    expect(action).toContain("confirm_patient_email");
    expect(action).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(action).not.toContain("setUserPassword");
    expect(action).not.toContain("email_confirmed_at:");
    expect(loginPage.toLowerCase()).not.toContain("supabase");
    expect(loginForm.toLowerCase()).not.toContain("supabase");
    expect(registerPage.toLowerCase()).not.toContain("supabase");
    expect(registerForm.toLowerCase()).not.toContain("supabase");
    expect(loginForm).toContain("Prijavi se");
    expect(registerForm).toContain("Registruj se");
    expect(registerForm).toContain("Potvrdi");
  });
});

describe("resend", () => {
  it("mails another code for the signed-in unconfirmed account", async () => {
    db.user = { id: "user-1", email: "ana@example.com" };
    db.account = { id: "acc-1", email: "ana@example.com", email_confirmed_at: null };
    const result = await resendPatientEmailCode(null, form({ slug: "centar" }));
    expect(result).toEqual({ ok: true, data: { step: "code" } });
    expect(mocks.createConfirmedUser).not.toHaveBeenCalled();
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });
});

describe("signOutPatient", () => {
  it("clears the local session and returns to the directory without a clinic", async () => {
    db.user = { id: "user-1", email: "ana@example.com" };
    await expect(signOutPatient(null, form({}))).rejects.toThrow("REDIRECT:/");
    expect(db.signOutScope).toBe("local");
    expect(db.user).toBeNull();
    const gate = mocks.cookieSet.mock.calls.find(([name]) => name === SESSION_GATE_COOKIE);
    expect(gate?.[1]).toBe("");
    expect(gate?.[2].maxAge).toBe(0);
  });

  it("clears the local session and returns to the clinic page", async () => {
    db.user = { id: "user-1", email: "ana@example.com" };
    await expect(signOutPatient(null, form({ slug: "Belino" }))).rejects.toThrow("REDIRECT:/ordinacije/belino");
    expect(db.signOutScope).toBe("local");
    expect(db.user).toBeNull();
    const gate = mocks.cookieSet.mock.calls.find(([name]) => name === SESSION_GATE_COOKIE);
    expect(gate?.[1]).toBe("");
    expect(gate?.[2].maxAge).toBe(0);
  });

  it("does not sign out when the clinic slug is not a real slug", async () => {
    db.user = { id: "user-1", email: "ana@example.com" };
    const result = await signOutPatient(null, form({ slug: "https://evil.example" }));
    expect(result).toEqual({ ok: false, error: "Odjava nije uspela. Pokušajte ponovo." });
    expect(db.signOutScope).toBeNull();
    expect(db.user).not.toBeNull();
  });

  it("clears local cookies and returns even when the provider rejects the sign-out", async () => {
    db.user = { id: "user-1", email: "ana@example.com" };
    db.signOutError = { code: "unexpected" };
    mocks.cookieGetAll.mockReturnValue([
      { name: "sb-project-auth-token", value: "token" },
      { name: "sb-project-auth-token.0", value: "token-chunk" },
      { name: SESSION_GATE_COOKIE, value: "patient" },
      { name: "dent_remember", value: "1" },
    ]);

    await expect(signOutPatient(null, form({ slug: "belino" }))).rejects.toThrow("REDIRECT:/ordinacije/belino");
    expect(db.user).not.toBeNull();
    expect(mocks.cookieSet.mock.calls.map(([name]) => name)).toEqual([
      "sb-project-auth-token",
      "sb-project-auth-token.0",
      "dent_remember",
      SESSION_GATE_COOKIE,
    ]);
    expect(mocks.cookieSet.mock.calls.every(([, value, options]) => value === "" && options.maxAge === 0)).toBe(true);
  });
});
