import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner: mocks.requireOwner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { geocodeAddress, saveClinicProfile } from "./settings";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const clinicId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  mocks.requireOwner.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.from.mockReset();
  mocks.storageFrom.mockReset();
  mocks.requireOwner.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId,
    role: "owner",
  });

  const update = vi.fn().mockResolvedValue({ error: null });
  const selectMaybeSingle = vi.fn().mockResolvedValue({
    data: { address: "Stara 1", city: "Beograd", logo_path: null },
    error: null,
  });
  const select = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      maybeSingle: selectMaybeSingle,
      update,
    }),
  });
  mocks.from.mockReturnValue({ select, update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
  mocks.storageFrom.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
  });
  mocks.createClient.mockResolvedValue({
    from: mocks.from,
    storage: { from: mocks.storageFrom },
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "44.8176", lon: "20.4569" }],
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saveClinicProfile", () => {
  it("stores slot step and horizon for the owner", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { address: "Knez Mihailova 1", city: "Beograd", logo_path: null },
            error: null,
          }),
        }),
      }),
      update,
    });

    const result = await saveClinicProfile(
      null,
      form({
        name: "Ordinacija Centar",
        city: "Beograd",
        address: "Knez Mihailova 1",
        phone: "011 234 5678",
        description: "Test",
        onlineBookingEnabled: "true",
        slotMinutes: "15",
        bufferMinutes: "5",
        defaultDurationMin: "30",
        minNoticeMinutes: "120",
        maxAheadDays: "45",
      }),
    );

    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        slot_minutes: 15,
        max_ahead_days: 45,
        min_notice_minutes: 120,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/podesavanja/ordinacija");
  });

  it("geocodes when the address changes", async () => {
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { address: "Stara 1", city: "Beograd", logo_path: null },
            error: null,
          }),
        }),
      }),
      update,
    });

    await saveClinicProfile(
      null,
      form({
        name: "Ordinacija Centar",
        city: "Beograd",
        address: "Nova 2",
        phone: "011 234 5678",
        description: "",
        slotMinutes: "30",
        bufferMinutes: "0",
        defaultDurationMin: "30",
        minNoticeMinutes: "60",
        maxAheadDays: "30",
      }),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: 44.8176,
        longitude: 20.4569,
      }),
    );
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("geocodeAddress", () => {
  it("returns coordinates from Nominatim", async () => {
    const result = await geocodeAddress("Knez Mihailova 1", "Beograd");
    expect(result).toEqual({ latitude: 44.8176, longitude: 20.4569 });
  });
});
