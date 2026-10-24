import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  gmailSend: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class Resend {
    emails = { send: mocks.send };
  },
}));

vi.mock("nodemailer", () => ({
  createTransport: (options: unknown) => {
    mocks.createTransport(options);
    return { sendMail: mocks.gmailSend };
  },
}));

import { formatAppointmentWhen, requestReceivedMessage, sendMail } from "@/lib/mail";

const startsAt = "2026-10-22T09:30:00.000Z";
const when = "četvrtak, 22. oktobar 2026., 11:30";

describe("request received mail", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.gmailSend.mockReset();
    mocks.createTransport.mockReset();
    mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    mocks.gmailSend.mockResolvedValue({ messageId: "gmail_1" });
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "ne-odgovaraj@example.com");
    vi.stubEnv("mail_test", "");
    vi.stubEnv("mail_password", "");
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

  it("sends through Gmail when mail_test and mail_password are set", async () => {
    vi.stubEnv("mail_test", "posta@gmail.com");
    vi.stubEnv("mail_password", "abcd efgh ijkl mnop");

    await sendMail({
      to: " ana@example.com ",
      subject: "Otvorite ordinaciju",
      fromName: "Ordinacija Centar",
      text: "Link važi 7 dana.",
    });

    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: "posta@gmail.com", pass: "abcdefghijklmnop" },
    });
    expect(mocks.gmailSend).toHaveBeenCalledWith({
      from: "Ordinacija Centar <posta@gmail.com>",
      to: "ana@example.com",
      subject: "Otvorite ordinaciju",
      text: "Link važi 7 dana.",
    });
  });

  it("maps a Gmail daily quota failure to the rate limit code", async () => {
    vi.stubEnv("mail_test", "posta@gmail.com");
    vi.stubEnv("mail_password", "abcdefghijklmnop");
    mocks.gmailSend.mockRejectedValue(Object.assign(new Error("SMTP"), { response: "550 5.4.5 Daily user sending quota exceeded" }));

    await expect(
      sendMail({
        to: "ana@example.com",
        subject: "Otvorite ordinaciju",
        text: "Link važi 7 dana.",
      }),
    ).rejects.toMatchObject({ name: "MailError", code: "rate_limit_exceeded" });
  });
});
