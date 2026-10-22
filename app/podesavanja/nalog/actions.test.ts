import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  hashInviteCode: vi.fn(),
  realHashInviteCode: null as null | ((code: string) => Promise<string>),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/clinic-invite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/clinic-invite")>();
  mocks.realHashInviteCode = actual.hashInviteCode;
  return {
    ...actual,
    hashInviteCode: mocks.hashInviteCode,
  };
});

import { isInviteCodeHash, verifyInviteCode } from "@/lib/clinic-invite";

import { changeAccountPassword, setAccountPin } from "./actions";

const cannedHash =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.updateUser.mockReset();
  mocks.rpc.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.hashInviteCode.mockReset();
  mocks.requireMember.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000003",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "reception",
  });
  mocks.createClient.mockResolvedValue({
    auth: { updateUser: mocks.updateUser },
    rpc: mocks.rpc,
  });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
  mocks.hashInviteCode.mockResolvedValue(cannedHash);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("changeAccountPassword", () => {
  it("asks for a password without calling Supabase", async () => {
    const result = await changeAccountPassword(null, form({ password: "" }));
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { password: ["Unesite lozinku."] },
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("stores the new password for the signed-in member", async () => {
    const result = await changeAccountPassword(null, form({ password: "nova-lozinka" }));
    expect(mocks.requireMember).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "nova-lozinka" });
    expect(result).toEqual({ ok: true, data: { saved: true } });
  });

  it("asks for another password when Supabase rejects it", async () => {
    mocks.updateUser.mockResolvedValue({ error: { code: "same_password", status: 422 } });
    const result = await changeAccountPassword(null, form({ password: "ista-lozinka" }));
    expect(result).toEqual({
      ok: false,
      error: "Izaberite drugu lozinku.",
      fieldErrors: { password: ["Izaberite drugu lozinku."] },
    });
  });

  it("does not change a password when the caller is not staff", async () => {
    mocks.requireMember.mockRejectedValue(new Error("REDIRECT:/prijava"));
    await expect(changeAccountPassword(null, form({ password: "nova-lozinka" }))).rejects.toThrow(
      "REDIRECT:/prijava",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("setAccountPin", () => {
  it("asks for six digits without hashing", async () => {
    const result = await setAccountPin(null, form({ pin: "12345" }));
    expect(result).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { pin: ["Unesite PIN od 6 cifara."] },
    });
    expect(mocks.hashInviteCode).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("stores an Argon2id hash of the PIN and not the PIN", async () => {
    const realHash = mocks.realHashInviteCode;
    expect(realHash).not.toBeNull();
    mocks.hashInviteCode.mockImplementation((code: string) => realHash!(code));
    const result = await setAccountPin(null, form({ pin: "123456" }));
    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(mocks.rpc).toHaveBeenCalledOnce();
    const [fn, args] = mocks.rpc.mock.calls[0] as [string, { p_pin_hash: string }];
    expect(fn).toBe("set_own_pin");
    expect(args.p_pin_hash).not.toBe("123456");
    expect(isInviteCodeHash(args.p_pin_hash)).toBe(true);
    await expect(verifyInviteCode(args.p_pin_hash, "123456")).resolves.toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/nalog");
  });

  it("does not replace a PIN that is already saved", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "already_set" }, error: null });
    const result = await setAccountPin(null, form({ pin: "123456" }));
    expect(result).toEqual({ ok: false, error: "PIN je već sačuvan." });
    expect(mocks.rpc).toHaveBeenCalledWith("set_own_pin", { p_pin_hash: cannedHash });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/nalog");
  });

  it("refuses a hash that is not Argon2id", async () => {
    mocks.hashInviteCode.mockResolvedValue("123456");
    const result = await setAccountPin(null, form({ pin: "123456" }));
    expect(result).toEqual({
      ok: false,
      error: "Čuvanje trenutno nije moguće. Pokušajte ponovo.",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
