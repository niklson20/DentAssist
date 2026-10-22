import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOwner, loadClinicProfile, loadSettingsPinGate } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  loadClinicProfile: vi.fn(),
  loadSettingsPinGate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOwner }));
vi.mock("../load-pin-gate", () => ({ loadSettingsPinGate }));
vi.mock("./load-clinic", () => ({ loadClinicProfile }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import Page from "./page";

const pageSource = readFileSync(path.join(process.cwd(), "app/podesavanja/ordinacija/page.tsx"), "utf8");
const formSource = readFileSync(
  path.join(process.cwd(), "app/podesavanja/ordinacija/clinic-profile-form.tsx"),
  "utf8",
);

const clinic = {
  name: "Ordinacija Centar",
  slug: "ordinacija-centar",
  city: "Beograd",
  address: "Knez Mihailova 1",
  phone: "+381112345678",
  description: "Test.",
  logoUrl: null,
  onlineBookingEnabled: false,
  slotMinutes: 15 as const,
  bufferMinutes: 0 as const,
  defaultDurationMin: 30,
  minNoticeMinutes: 60,
  maxAheadDays: 45,
};

beforeEach(() => {
  requireOwner.mockReset();
  loadClinicProfile.mockReset();
  loadSettingsPinGate.mockReset();
  loadSettingsPinGate.mockResolvedValue({ status: "open" });
  requireOwner.mockResolvedValue({
    userId: "10000000-0000-4000-8000-000000000002",
    clinicId: "11111111-1111-4111-8111-111111111111",
    role: "owner",
  });
});

describe("clinic profile page", () => {
  it("keeps Supabase out of the page and the form", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
  });

  it("shows the public link from APP_URL and the booking horizon field", async () => {
    loadClinicProfile.mockResolvedValue({
      status: "ready",
      clinic,
      publicPageUrl: "https://dentassist.rs/ordinacije/ordinacija-centar",
    });
    const html = renderToStaticMarkup(await Page());
    expect(requireOwner).toHaveBeenCalledOnce();
    expect(html).toContain("https://dentassist.rs/ordinacije/ordinacija-centar");
    expect(html).toContain('name="maxAheadDays"');
    expect(html).toContain('name="slotMinutes"');
    expect(html).toContain('value="45"');
  });

  it("asks for a PIN before loading the clinic", async () => {
    loadSettingsPinGate.mockResolvedValue({ status: "locked", pinSet: true });
    const html = renderToStaticMarkup(await Page());
    expect(html).toContain("PIN vlasnika");
    expect(html).not.toContain('name="maxAheadDays"');
    expect(loadClinicProfile).not.toHaveBeenCalled();
  });
});
