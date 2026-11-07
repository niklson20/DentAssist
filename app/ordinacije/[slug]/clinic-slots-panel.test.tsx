import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ClinicSlotsPanel } from "./clinic-slots-panel";

vi.mock("@phosphor-icons/react", () => ({
  CaretLeft: () => null,
  CaretRight: () => null,
}));

describe("clinic slot calendar", () => {
  it("renders a month calendar while preserving the free-slot buttons", () => {
    const html = renderToStaticMarkup(
      <ClinicSlotsPanel
        slug="centar"
        dentistId="11111111-1111-4111-8111-111111111111"
        todayIso="2026-11-07"
        bookingDays={["2026-11-07", "2026-11-08", "2026-11-09"]}
        initialDay="2026-11-07"
        initialSlots={["2026-11-07T08:30:00+01:00", "2026-11-07T09:00:00+01:00"]}
      />,
    );

    expect(html).toContain("novembar 2026");
    expect(html).toContain('aria-label="Prethodni mjesec"');
    expect(html).toContain('aria-label="Sljedeći mjesec"');
    expect(html).toContain('aria-label="subota, 7. novembar 2026."');
    expect(html).toContain("Slobodni termini");
    expect(html).toContain("08:30");
    expect(html).toContain("09:00");
    expect(html).not.toContain("overflow-x-auto");
  });
});
