import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

import { loadStaffClinicName, staffBrowserTitle, staffBrowserTitleTemplate } from "./staff-browser-title";
import { SESSION_GATE_COOKIE } from "@/proxy";

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.select.mockReset();
  mocks.eq.mockReset();
  mocks.maybeSingle.mockReset();
  mocks.cookieGet.mockReset();
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.rpc.mockResolvedValue({ data: "clinic-1", error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { name: "Belino" }, error: null });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, from: mocks.from });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadStaffClinicName", () => {
  it("does not look up a clinic outside a staff session", async () => {
    expect(await loadStaffClinicName()).toBeNull();
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "patient" } : undefined,
    );
    expect(await loadStaffClinicName()).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns the clinic name for a staff session", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "staff" } : undefined,
    );
    expect(await loadStaffClinicName()).toBe("Belino");
    expect(mocks.rpc).toHaveBeenCalledWith("current_clinic_id");
    expect(mocks.from).toHaveBeenCalledWith("clinics");
  });

  it("returns null when the clinic name cannot be read", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "staff" } : undefined,
    );
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await loadStaffClinicName()).toBeNull();
    mocks.rpc.mockResolvedValue({ data: "clinic-1", error: null });
    mocks.maybeSingle.mockResolvedValue({ data: { name: "  " }, error: null });
    expect(await loadStaffClinicName()).toBeNull();
  });
});

describe("staffBrowserTitle", () => {
  it("uses the clinic name when the staff session has one", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "staff" } : undefined,
    );
    expect(await staffBrowserTitle("Kalendar")).toEqual({ title: "Kalendar — Belino" });
  });

  it("falls back to DentAssist without a staff clinic", async () => {
    expect(await staffBrowserTitle("Kalendar")).toEqual({ title: "Kalendar — DentAssist" });
  });
});

describe("staffBrowserTitleTemplate", () => {
  it("builds a title template with the clinic name", async () => {
    mocks.cookieGet.mockImplementation((name: string) =>
      name === SESSION_GATE_COOKIE ? { value: "staff" } : undefined,
    );
    expect(await staffBrowserTitleTemplate("Podešavanja")).toEqual({
      title: {
        default: "Podešavanja — Belino",
        template: "%s — Belino",
      },
    });
  });
});
