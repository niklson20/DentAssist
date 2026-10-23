import { describe, expect, it } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";
import { appointmentMovedMessage, formatAppointmentWhen } from "@/lib/mail";

const startsAt = parseBelgradeLocal("2026-06-08T11:00").toISOString();
const when = "ponedeljak, 8. jun 2026., 11:00";

describe("appointment moved mail", () => {
  it("builds Termin je pomeren for 2026-06-08 with the new time and dentist", () => {
    expect(formatAppointmentWhen(startsAt)).toBe(when);

    const message = appointmentMovedMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      startsAt,
      dentistName: "Mina Minić",
      address: "Knez Mihailova 1",
      phone: "011123456",
    });

    expect(message).toEqual({
      to: "ana@example.com",
      subject: "Termin je pomeren",
      fromName: "Ordinacija Centar",
      text: `Novi termin: ${when}, Mina Minić, Knez Mihailova 1. Telefon: 011123456.`,
    });
    expect(message.text).not.toContain("Ordinacija");
    expect(message.text).not.toMatch(/https?:/i);
  });
});
