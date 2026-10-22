import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  createClient: vi.fn(),
  getSessionKind: vi.fn(),
  readReceptionPin: vi.fn(),
  recordReceptionPinFailure: vi.fn(),
  clearReceptionPinFailures: vi.fn(),
  createMagicLinkToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, set: mocks.cookieSet }),
}));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getSessionKind: mocks.getSessionKind,
}));
vi.mock("@/lib/supabase/admin", () => ({
  readReceptionPin: mocks.readReceptionPin,
  recordReceptionPinFailure: mocks.recordReceptionPinFailure,
  clearReceptionPinFailures: mocks.clearReceptionPinFailures,
  createMagicLinkToken: mocks.createMagicLinkToken,
}));

import { signInWithDevicePassword, signInWithPin } from "@/app/actions/pin";
import { hashInviteCode } from "@/lib/clinic-invite";
import { hashDeviceSecret } from "@/lib/clinic-invite";
import { PIN_LOCK_ERROR } from "@/lib/reception-pin-ui";
import { REMEMBER_COOKIE } from "@/lib/supabase/server";
import { SESSION_GATE_COOKIE } from "@/proxy";

const pepper = "test-pepper";
const secret = "device-secret";
const memberId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const email = "ana@example.com";

let pinHash = "";
let previousPepper: string | undefined;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

function cookieCall(name: string) {
  return mocks.cookieSet.mock.calls.find(([cookieName]) => cookieName === name);
}

beforeAll(async () => {
  pinHash = await hashInviteCode("123456");
});

beforeEach(() => {
  previousPepper = process.env.TOKEN_PEPPER;
  process.env.TOKEN_PEPPER = pepper;
  Object.values(mocks).forEach((mock) => mock.mockClear());
  mocks.cookieGet.mockReturnValue({ value: secret });
  mocks.createClient.mockResolvedValue({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      verifyOtp: mocks.verifyOtp,
      getUser: mocks.getUser,
    },
  });
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  mocks.getSessionKind.mockResolvedValue("staff");
  mocks.clearReceptionPinFailures.mockResolvedValue({ status: "ok" });
  mocks.createMagicLinkToken.mockResolvedValue({
    status: "ok",
    token: "hashed-token",
    userId,
    otpType: "magiclink",
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  if (previousPepper === undefined) {
    delete process.env.TOKEN_PEPPER;
  } else {
    process.env.TOKEN_PEPPER = previousPepper;
  }
  vi.restoreAllMocks();
});

describe("signInWithPin", () => {
  it("rejects a short PIN without reading the device", async () => {
    const result = await signInWithPin(null, form({ memberId, pin: "123" }));
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { pin: ["Unesite PIN od 6 cifara."] },
    });
    expect(mocks.readReceptionPin).not.toHaveBeenCalled();
  });

  it("opens that member's session and does not remember the browser", async () => {
    mocks.readReceptionPin.mockResolvedValue({
      status: "ready",
      pinHash,
      email,
      userId,
      attemptCount: 1,
    });

    await expect(signInWithPin(null, form({ memberId, pin: "123456" }))).rejects.toThrow("REDIRECT:/danas");

    const hash = hashDeviceSecret(secret, pepper);
    expect(mocks.readReceptionPin).toHaveBeenCalledWith(hash, memberId);
    expect(mocks.createMagicLinkToken).toHaveBeenCalledWith(email);
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.verifyOtp.mock.invocationCallOrder[0]);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "hashed-token", type: "magiclink" });
    expect(mocks.createClient).toHaveBeenCalledWith({ remember: false });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.clearReceptionPinFailures).toHaveBeenCalledWith(hash, memberId);
    expect(cookieCall(REMEMBER_COOKIE)?.[1]).toBe("0");
    expect(cookieCall(REMEMBER_COOKIE)?.[2].maxAge).toBeUndefined();
    expect(cookieCall(SESSION_GATE_COOKIE)?.[1]).toBe("staff");
    expect(cookieCall(SESSION_GATE_COOKIE)?.[2].maxAge).toBeUndefined();
  });

  it("does not open a session when the magic-link user is someone else", async () => {
    mocks.readReceptionPin.mockResolvedValue({
      status: "ready",
      pinHash,
      email,
      userId,
      attemptCount: 0,
    });
    mocks.createMagicLinkToken.mockResolvedValue({
      status: "ok",
      token: "hashed-token",
      userId: "33333333-3333-4333-8333-333333333333",
      otpType: "magiclink",
    });

    const result = await signInWithPin(null, form({ memberId, pin: "123456" }));
    expect(result).toEqual({ ok: false, error: "Prijava trenutno nije moguća. Pokušajte ponovo." });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("reports the attempts that remain", async () => {
    mocks.readReceptionPin.mockResolvedValue({
      status: "ready",
      pinHash,
      email,
      userId,
      attemptCount: 0,
    });
    mocks.recordReceptionPinFailure.mockResolvedValue({ status: "wrong", attemptCount: 1 });

    const result = await signInWithPin(null, form({ memberId, pin: "000000" }));
    expect(result).toEqual({ ok: false, error: "Pogrešan PIN. Ostala su još 4 pokušaja." });
    expect(result).not.toHaveProperty("email");
    expect(mocks.createMagicLinkToken).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("asks for the password after five failures and does not open a session", async () => {
    mocks.readReceptionPin.mockResolvedValue({
      status: "ready",
      pinHash,
      email,
      userId,
      attemptCount: 4,
    });
    mocks.recordReceptionPinFailure.mockResolvedValue({ status: "password", attemptCount: 5 });

    const result = await signInWithPin(null, form({ memberId, pin: "000000" }));
    expect(result).toEqual({ ok: false, error: PIN_LOCK_ERROR });
    expect(mocks.createMagicLinkToken).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("does not offer a session when the device is revoked", async () => {
    mocks.readReceptionPin.mockResolvedValue({ status: "invalid" });
    const result = await signInWithPin(null, form({ memberId, pin: "123456" }));
    expect(result).toEqual({ ok: false, error: "Ovaj računar više nije povezan." });
    expect(mocks.createMagicLinkToken).not.toHaveBeenCalled();
  });
});

describe("signInWithDevicePassword", () => {
  it("signs in without Zapamti me and clears the PIN counter", async () => {
    mocks.readReceptionPin.mockResolvedValue({ status: "password", email, userId });

    await expect(
      signInWithDevicePassword(null, form({ memberId, password: "lozinka" })),
    ).rejects.toThrow("REDIRECT:/danas");

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email, password: "lozinka" });
    expect(mocks.createClient).toHaveBeenCalledWith({ remember: false });
    expect(mocks.createMagicLinkToken).not.toHaveBeenCalled();
    expect(cookieCall(REMEMBER_COOKIE)?.[1]).toBe("0");
    expect(cookieCall(REMEMBER_COOKIE)?.[2].maxAge).toBeUndefined();
    expect(mocks.clearReceptionPinFailures).toHaveBeenCalledWith(hashDeviceSecret(secret, pepper), memberId);
  });

  it("does not reset the counter when the password is wrong", async () => {
    mocks.readReceptionPin.mockResolvedValue({ status: "password", email, userId });
    mocks.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400 } });

    const result = await signInWithDevicePassword(null, form({ memberId, password: "pogresno" }));
    expect(result).toEqual({ ok: false, error: "Pogrešna lozinka." });
    expect(mocks.clearReceptionPinFailures).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("refuses the password while the PIN is still open", async () => {
    mocks.readReceptionPin.mockResolvedValue({
      status: "ready",
      pinHash,
      email,
      userId,
      attemptCount: 0,
    });

    const result = await signInWithDevicePassword(null, form({ memberId, password: "lozinka" }));
    expect(result).toEqual({ ok: false, error: "Unesite PIN." });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
});
