import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getClaims: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

import { SETTINGS_PIN_COOKIE } from "./pin-gate";
import { loadSettingsPinGate } from "./load-pin-gate";

const clinicId = "11111111-1111-4111-8111-111111111111";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = { userId: "10000000-0000-4000-8000-000000000002", clinicId, role: "owner" as const };

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  mocks.getClaims.mockReset();
  mocks.cookieGet.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: { session_id: sessionId } }, error: null });
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.createClient.mockResolvedValue({
    from: mocks.from,
    rpc: mocks.rpc,
    auth: { getClaims: mocks.getClaims },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadSettingsPinGate", () => {
  it("opens settings for a dentist without reading the clinic", async () => {
    const gate = await loadSettingsPinGate({ ...owner, role: "dentist" });
    expect(gate).toEqual({ status: "open" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("opens settings for the sole owner without a live invite", async () => {
    mockClinic([{ id: "member-1" }], []);
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "open" });
  });

  it("asks for a PIN when another member exists", async () => {
    mockClinic([{ id: "member-1" }, { id: "member-2" }], []);
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "locked", pinSet: true });
  });

  it("asks for a PIN when a live invite exists", async () => {
    mockClinic([{ id: "member-1" }], [liveInvite()]);
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "locked", pinSet: true });
  });

  it("ignores an expired invite", async () => {
    mockClinic([{ id: "member-1" }], [liveInvite("2020-01-01T00:00:00.000Z")]);
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "open" });
  });

  it("opens a locked clinic when the cookie matches this session", async () => {
    mockClinic([{ id: "member-1" }, { id: "member-2" }], []);
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SETTINGS_PIN_COOKIE ? { value: sessionId } : undefined,
    );
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "open" });
  });

  it("stays locked when the cookie belongs to another session", async () => {
    mockClinic([{ id: "member-1" }, { id: "member-2" }], []);
    mocks.cookieGet.mockReturnValue({ value: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "locked", pinSet: true });
  });

  it("stays closed when members cannot be read", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "clinic_members") {
        return { select: () => ({ eq: () => Promise.resolve({ data: null, error: { code: "42501" } }) }) };
      }
      return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }) };
    });
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "unavailable" });
  });

  it("stays closed when the PIN state cannot be read", async () => {
    mockClinic([{ id: "member-1" }, { id: "member-2" }], []);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "unavailable" });
  });

  it("reports an empty PIN without offering the field through a false pinSet", async () => {
    mockClinic([{ id: "member-1" }, { id: "member-2" }], []);
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const gate = await loadSettingsPinGate(owner);
    expect(gate).toEqual({ status: "locked", pinSet: false });
  });
});

function liveInvite(expiresAt = "2099-01-01T00:00:00.000Z") {
  return { used_at: null, attempt_count: 0, expires_at: expiresAt };
}

function mockClinic(
  members: { id: string }[],
  invites: { used_at: null; attempt_count: number; expires_at: string }[],
) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "clinic_members") {
      return { select: () => ({ eq: () => Promise.resolve({ data: members, error: null }) }) };
    }
    if (table === "staff_invites") {
      return {
        select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: invites, error: null }) }) }),
      };
    }
    throw new Error(table);
  });
}
