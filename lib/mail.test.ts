import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: mocks.send };
  },
}));

import { formatAppointmentWhen, requestReceivedMessage, sendMail } from "@/lib/mail";

const startsAt = "2026-10-22T09:30:00.000Z";
const when = "četvrtak, 22. oktobar 2026., 11:30";

describe("request received mail", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "ne-odgovaraj@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formats the visit in Belgrade", () => {
    expect(formatAppointmentWhen(startsAt)).toBe(when);
    expect(formatAppointmentWhen("not-a-date")).toBe("");
  });

  it("builds Zahtev je primljen for the patient, with the clinic phone and no calendar link", () => {
    const message = requestReceivedMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      patientName: "Ana Anić",
      startsAt,
      dentistName: "Mina Minić",
      address: "Knez Mihailova 1",
      phone: "011123456",
    });

    expect(message).toEqual({
      to: "ana@example.com",
      subject: "Zahtev je primljen",
      fromName: "Ordinacija Centar",
      text: `Zahtev za termin je primljen. Ordinacija Centar treba da ga potvrdi. Ana Anić, ${when}, Mina Minić, Knez Mihailova 1. Telefon: 011123456.`,
    });
    expect(message.text).not.toMatch(/https?:/i);
    expect(message.text).not.toContain(".ics");
  });

  it("sends appointment mail from the clinic name on the application address", async () => {
    const message = requestReceivedMessage({
      to: "ana@example.com",
      clinicName: "Ordinacija Centar",
      patientName: "Ana Anić",
      startsAt,
      dentistName: "Mina Minić",
      address: "Knez Mihailova 1",
      phone: "011123456",
    });

    await sendMail(message);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({
      from: "Ordinacija Centar <ne-odgovaraj@example.com>",
      to: "ana@example.com",
      subject: "Zahtev je primljen",
      text: message.text,
    });
    expect(Object.keys(mocks.send.mock.calls[0]?.[0] as object).sort()).toEqual([
      "from",
      "subject",
      "text",
      "to",
    ]);
  });

  it("keeps a display name that contains a comma inside quotes", async () => {
    await sendMail({
      to: "ana@example.com",
      subject: "Zahtev je primljen",
      fromName: "Ordinacija, Centar",
      text: "Tekst.",
    });

    expect(mocks.send.mock.calls[0]?.[0].from).toBe('"Ordinacija, Centar" <ne-odgovaraj@example.com>');
  });

  it("keeps DentAssist for account mail", async () => {
    await sendMail({
      to: "ana@example.com",
      subject: "Potvrdite mejl",
      text: "Kod za potvrdu mejla je 123456.",
    });

    expect(mocks.send.mock.calls[0]?.[0].from).toBe("DentAssist <ne-odgovaraj@example.com>");
  });

  it("leaves an existing account sender untouched when no clinic name is passed", async () => {
    vi.stubEnv("MAIL_FROM", "DentAssist <ne-odgovaraj@example.com>");

    await sendMail({
      to: "ana@example.com",
      subject: "Nova lozinka",
      text: "Nova lozinka je spremna.",
    });

    expect(mocks.send.mock.calls[0]?.[0].from).toBe("DentAssist <ne-odgovaraj@example.com>");
  });

  it("uses the clinic name even when MAIL_FROM already names DentAssist", async () => {
    vi.stubEnv("MAIL_FROM", "DentAssist <ne-odgovaraj@example.com>");

    await sendMail({
      to: "ana@example.com",
      subject: "Zahtev je primljen",
      fromName: "Ordinacija Centar",
      text: "Zahtev za termin je primljen.",
    });

    expect(mocks.send.mock.calls[0]?.[0].from).toBe("Ordinacija Centar <ne-odgovaraj@example.com>");
    expect(mocks.send.mock.calls[0]?.[0].to).toBe("ana@example.com");
  });
});
