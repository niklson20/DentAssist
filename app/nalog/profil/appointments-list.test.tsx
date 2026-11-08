import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProfileAppointmentsList } from "./appointments-list";

const appointment = {
  appointmentId: "11111111-1111-4111-8111-111111111111",
  startsAt: "2026-04-15T08:30:00.000Z",
  endsAt: "2026-04-15T09:00:00.000Z",
  clinicName: "Ordinacija Centar",
  dentistName: "Mina Minić",
  status: "completed" as const,
  clinicRating: null,
  dentistRating: null,
};

describe("ProfileAppointmentsList reviews", () => {
  it("offers a review for completed appointments", () => {
    const html = renderToStaticMarkup(<ProfileAppointmentsList items={[appointment]} />);
    expect(html).toContain("Ocena ordinacije");
    expect(html).toContain("Sačuvaj ocenu");
  });

  it("shows saved clinic and dentist ratings on completed appointments", () => {
    const html = renderToStaticMarkup(
      <ProfileAppointmentsList
        items={[{ ...appointment, clinicRating: 5, dentistRating: 4 }]}
      />,
    );
    expect(html).toContain("Vaše ocene");
    expect(html).toContain(">Ordinacija</span>");
    expect(html).toContain(">5/5</span>");
    expect(html).toContain(">Stomatolog</span>");
    expect(html).toContain(">4/5</span>");
  });

  it("does not offer a review before the appointment is completed", () => {
    const html = renderToStaticMarkup(
      <ProfileAppointmentsList items={[{ ...appointment, status: "scheduled" }]} />,
    );
    expect(html).not.toContain("Ocena ordinacije");
    expect(html).not.toContain("Vaše ocene");
  });
});
