import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  verifyInviteCode: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/clinic-invite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clinic-invite")>();
  return { ...actual, verifyInviteCode: mocks.verifyInviteCode };
});

import { REMEMBER_COOKIE, REMEMBER_MAX_AGE_SECONDS } from "@/lib/supabase/cookies";

import { unlockSettingsPin } from "./actions";
import { SETTINGS_PIN_COOKIE } from "./pin-gate";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pinHash =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function form(pin: string): FormData {
  const data = new FormData();
  data.set("pin", pin);
  return data;
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.rpc.mockReset();
  mocks.getClaims.mockReset();
  mocks.cookieGet.mockReset();
  mocks.cookieSet.mockReset();
  mocks.verifyInviteCode.mockReset();
  mocks.requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  });
  mocks.rpc.mockResolvedValue({ data: { status: "ready", pin_hash: pinHash }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { session_id: sessionId } }, error: null });
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.verifyInviteCode.mockResolvedValue(true);
  mocks.createClient.mockResolvedValue({
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("unlockSettingsPin", () => {
  it("rejects a PIN that is not six digits", async () => {
    const result = await unlockSettingsPin(null, form("12345"));
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { pin: ["Unesite PIN od 6 cifara."] },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("stores the session id when the PIN matches and omits the hash", async () => {
    const result = await unlockSettingsPin(null, form("123456"));
    expect(result).toEqual({ ok: true, data: { unlocked: true } });
    expect(JSON.stringify(result)).not.toContain(pinHash);
    expect(mocks.rpc).toHaveBeenCalledWith("read_owner_settings_pin");
    expect(mocks.verifyInviteCode).toHaveBeenCalledWith(pinHash, "123456");
    expect(mocks.cookieSet).toHaveBeenCalledOnce();
    const [name, value, options] = mocks.cookieSet.mock.calls[0] as [string, string, { httpOnly: boolean; maxAge?: number }];
    expect(name).toBe(SETTINGS_PIN_COOKIE);
    expect(value).toBe(sessionId);
    expect(options.httpOnly).toBe(true);
    expect(options.maxAge).toBeUndefined();
  });

  it("keeps the cookie for the remembered session", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === REMEMBER_COOKIE ? { value: "1" } : undefined,
    );
    const result = await unlockSettingsPin(null, form("123456"));
    expect(result.ok).toBe(true);
    const options = mocks.cookieSet.mock.calls[0]?.[2] as { maxAge?: number };
    expect(options.maxAge).toBe(REMEMBER_MAX_AGE_SECONDS);
  });

  it("does not set a cookie for the wrong PIN", async () => {
    mocks.verifyInviteCode.mockResolvedValue(false);
    const result = await unlockSettingsPin(null, form("123456"));
    expect(result).toEqual({
      ok: false,
      error: "Pogrešan PIN.",
      fieldErrors: { pin: ["Pogrešan PIN."] },
    });
    expect(JSON.stringify(result)).not.toContain(pinHash);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it("points at the account page when the owner has no PIN", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "unset" }, error: null });
    const result = await unlockSettingsPin(null, form("123456"));
    expect(result).toEqual({ ok: false, error: "Prvo postavite PIN na stranici Nalog." });
    expect(mocks.verifyInviteCode).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("does not unlock a dentist", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: "10000000-0000-4000-8000-000000000003",
      clinicId: "11111111-1111-4111-8111-111111111111",
      role: "dentist",
    });
    const result = await unlockSettingsPin(null, form("123456"));
    expect(result).toEqual({ ok: false, error: "PIN trenutno nije dostupan. Pokušajte ponovo." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
