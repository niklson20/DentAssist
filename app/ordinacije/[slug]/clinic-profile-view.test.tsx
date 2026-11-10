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
  const dentist = {
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Ana",
    lastName: "Jović",
    rating: { average: 4.8, count: 6 },
  };

  it("shows the city and aggregated weekday and weekend hours", () => {
    const html = renderToStaticMarkup(
      <ClinicProfileView
        slug="centar"
        name="Ordinacija Centar"
        city="Beograd"
        address="Knez Mihailova 1"
        phone="+381 60 123 4567"
        description=""
        logoUrl={null}
        rating={{ average: 4.5, count: 8 }}
        weekdayHours={{ opensAt: "08:00:00", closesAt: "18:00:00" }}
        weekendHours={null}
        weekdayHasSchedule
        weekendHasSchedule
        dentists={[dentist]}
        initialDentistId={null}
        currentTimeIso="2026-11-09T09:00:00.000Z"
        showPatientAuth
        showSlotsHint
        bookingDays={[]}
        todayIso="2026-11-07"
        initialSlots={[]}
        staffEntryUrl="/staff"
      />,
    );

    expect(html).toContain("Knez Mihailova 1, Beograd");
    expect(html).toContain('role="img" aria-label="Prosečna ocena 4,5 od 5, 8 ocena"');
    expect(html).toContain(">4,5</span>");
    expect(html).toContain(">8 ocena</span>");
    expect(html).toContain('href="tel:+381601234567"');
    expect(html).toContain('href="#clinic-booking"');
    expect(html).toContain("Ana Jović");
    expect(html).toContain("4,8/5 · 6");
    expect(html).toContain("Pon – Pet");
    expect(html).toContain("08:00 – 18:00");
    expect(html).toContain("Sub – Ned");
    expect(html).toContain("Zatvoreno");
    expect(html).toContain(">Otvoreno</span>");
    expect(html.indexOf("Sub – Ned")).toBeGreaterThan(html.indexOf("Pon – Pet"));
  });

  it("shows public dentist ratings before login", () => {
    const html = renderToStaticMarkup(
      <ClinicProfileView
        slug="centar"
        name="Ordinacija Centar"
        city="Beograd"
        address="Knez Mihailova 1"
        phone=""
        description=""
        logoUrl={null}
        weekdayHours={null}
        weekendHours={null}
        weekdayHasSchedule={false}
        weekendHasSchedule={false}
        dentists={[dentist]}
        initialDentistId={null}
        currentTimeIso="2026-11-07T10:00:00.000Z"
        showPatientAuth
        showSlotsHint
        bookingDays={[]}
        todayIso="2026-11-07"
        initialSlots={[]}
        staffEntryUrl="/staff"
      />,
    );

    expect(html).toContain("Ana Jović");
    expect(html).toContain("4,8/5 · 6");
    expect(html).toContain(">Nije navedeno</span>");
    expect(html).toContain("Prijavite se");
    expect(html).toContain("da vidite slobodne termine.");
  });
});
