import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../public-site-nav", () => ({
  PublicSiteNav: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../public-site-footer", () => ({
  PublicSiteFooter: () => null,
  publicSiteFooterClearance: "",
}));

vi.mock("@/components/ui/button", () => ({
  Button: () => null,
  buttonVariants: () => "",
}));

vi.mock("./clinic-slots-panel", () => ({ ClinicSlotsPanel: () => null }));
vi.mock("./sign-out-button", () => ({ PatientSignOutButton: () => null }));

import { ClinicProfileView } from "./clinic-profile-view";

describe("clinic profile details", () => {
  it("shows the city and aggregated weekday and weekend hours", () => {
    const html = renderToStaticMarkup(
      <ClinicProfileView
        slug="centar"
        name="Ordinacija Centar"
        city="Beograd"
        address="Knez Mihailova 1"
        phone=""
        description=""
        logoUrl={null}
        weekdayHours={{ opensAt: "08:00:00", closesAt: "18:00:00" }}
        weekendHours={null}
        weekdayHasSchedule
        weekendHasSchedule
        dentists={[]}
        initialDentistId={null}
        showPatientAuth
        showSlotsHint
        bookingDays={[]}
        todayIso="2026-11-07"
        initialSlots={[]}
        staffEntryUrl="/staff"
      />,
    );

    expect(html).toContain("Knez Mihailova 1, Beograd");
    expect(html).toContain("Radnim danima:");
    expect(html).toContain("08:00–18:00");
    expect(html).toContain("Vikendom:");
    expect(html).toContain("Zatvoreno");
    expect(html.indexOf("Vikendom")).toBeGreaterThan(html.indexOf("Radnim danima"));
  });
});
