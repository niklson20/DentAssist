import { describe, expect, it } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";
import { reminderSoonMessage, reminderTomorrowMessage } from "@/lib/mail";

const startsAt = parseBelgradeLocal("2026-06-08T11:00").toISOString();

describe("appointment reminder mail", () => {
  it("builds Podsetnik za sutra for the patient on 2026-06-08", () => {
    const message = reminderTomorrowMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      startsAt,
      dentistName: "Mina Minić",
      address: "Knez Mihailova 1",
      phone: "011123456",
    });

    expect(message).toEqual({
      to: "ana@example.com",
      subject: "Podsetnik za sutra",
      fromName: "Ordinacija Centar",
      text: "Sutra: 11:00, Mina Minić, Knez Mihailova 1. Telefon: 011123456.",
    });
    expect(message.to).not.toContain("Ordinacija");
    expect(message.text).not.toContain("Ordinacija");
  });

  it("builds Termin je za dva sata for the patient on 2026-06-08", () => {
    const message = reminderSoonMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      startsAt,
      dentistName: "Mina Minić",
      phone: "011123456",
    });

    expect(message).toEqual({
      to: "ana@example.com",
      subject: "Termin je za dva sata",
      fromName: "Ordinacija Centar",
      text: "Termin je u 11:00, Mina Minić. Promena se radi telefonom: 011123456.",
    });
    expect(message.to).not.toContain("Ordinacija");
    expect(message.text).not.toContain("Ordinacija");
  });
});
