import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseBelgradeLocal } from "@/lib/calendar-dates";
import {
  APPOINTMENT_CANCELLED_SUBJECT,
  APPOINTMENT_CONFIRMED_SUBJECT,
  APPOINTMENT_MOVED_SUBJECT,
  appointmentCancelledMessage,
  appointmentConfirmedMessage,
  appointmentMovedMessage,
  formatAppointmentWhen,
  OFFERED_TIMES_SUBJECT,
  offeredTimesMessage,
  REQUEST_REJECTED_SUBJECT,
  requestRejectedMessage,
} from "@/lib/mail";

const startsAt = parseBelgradeLocal("2026-06-08T11:00").toISOString();
const when = "ponedeljak, 8. jun 2026., 11:00";
const deadlineAt = parseBelgradeLocal("2026-06-10T12:00").toISOString();
const deadline = formatAppointmentWhen(deadlineAt);
const link = "https://dentassist.rs/zakazivanje/ponuda-token";

describe("staff appointment mail", () => {
  it("builds Termin je potvrđen for the patient, with the clinic phone and no cancel link", () => {
    expect(formatAppointmentWhen(startsAt)).toBe(when);
    expect(APPOINTMENT_CONFIRMED_SUBJECT).toBe("Termin je potvrđen");

    const message = appointmentConfirmedMessage({
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
      subject: "Termin je potvrđen",
      fromName: "Ordinacija Centar",
      text: `Termin je potvrđen. Ana Anić, ${when}, Mina Minić, Knez Mihailova 1. Telefon: 011123456.`,
    });
    expect(message.text).not.toContain("24 sata");
    expect(message.text).not.toContain("Ordinacija");
    expect(message.text).not.toMatch(/https?:/i);
    expect(message.to).not.toContain("Ordinacija");
  });

  it("builds Zahtev nije prihvaćen and leaves an empty note out", () => {
    expect(REQUEST_REJECTED_SUBJECT).toBe("Zahtev nije prihvaćen");

    const withNote = requestRejectedMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      message: "Nema slobodnog termina",
      phone: "011123456",
    });
    const withoutNote = requestRejectedMessage({
      to: "ana@example.com",
      clinicName: "Ordinacija Centar",
      message: "  ",
      phone: "011123456",
    });
    const finishedNote = requestRejectedMessage({
      to: "ana@example.com",
      clinicName: "Ordinacija Centar",
      message: "Nema mesta.",
      phone: "011123456",
    });

    expect(withNote).toEqual({
      to: "ana@example.com",
      subject: "Zahtev nije prihvaćen",
      fromName: "Ordinacija Centar",
      text: "Ordinacija Centar ne može da primi ovaj termin. Nema slobodnog termina. Telefon: 011123456.",
    });
    expect(withoutNote.text).toBe(
      "Ordinacija Centar ne može da primi ovaj termin. Telefon: 011123456.",
    );
    expect(finishedNote.text).toBe(
      "Ordinacija Centar ne može da primi ovaj termin. Nema mesta. Telefon: 011123456.",
    );
    expect(withNote.to).toBe("ana@example.com");
    expect(withNote.text).not.toMatch(/https?:/i);
  });

  it("builds Termin je otkazan and includes the clinic note only when it exists", () => {
    expect(APPOINTMENT_CANCELLED_SUBJECT).toBe("Termin je otkazan");

    const withNote = appointmentCancelledMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      startsAt,
      message: "Stomatolog je sprečen",
      phone: "011123456",
    });
    const withoutNote = appointmentCancelledMessage({
      to: "ana@example.com",
      clinicName: "Ordinacija Centar",
      startsAt,
      message: "",
      phone: "011123456",
    });

    expect(withNote).toEqual({
      to: "ana@example.com",
      subject: "Termin je otkazan",
      fromName: "Ordinacija Centar",
      text: `Termin ${when} je otkazan. Stomatolog je sprečen. Telefon: 011123456.`,
    });
    expect(withoutNote.text).toBe(`Termin ${when} je otkazan. Telefon: 011123456.`);
    expect(withNote.text).not.toContain("Ordinacija");
    expect(withNote.text).not.toMatch(/https?:/i);
    expect(withNote.to).not.toContain("Ordinacija");
  });

  it("builds Ponuđeni termini with the choice link and the deadline", () => {
    expect(OFFERED_TIMES_SUBJECT).toBe("Ponuđeni termini");
    expect(deadline).not.toBe("");

    const message = offeredTimesMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      dentistName: "Mina Minić",
      link,
      deadlineAt,
      phone: "011123456",
    });

    expect(message).toEqual({
      to: "ana@example.com",
      subject: "Ponuđeni termini",
      fromName: "Ordinacija Centar",
      text: `Ordinacija Centar nudi druga vremena kod Mina Minić. Izaberite jedan, ili javite da nijedan ne odgovara: ${link}. Rok za izbor: ${deadline}. Telefon: 011123456.`,
    });
    expect(message.to).not.toContain("Ordinacija");
  });

  it("keeps Termin je pomeren", () => {
    expect(APPOINTMENT_MOVED_SUBJECT).toBe("Termin je pomeren");

    const message = appointmentMovedMessage({
      to: " ana@example.com ",
      clinicName: "Ordinacija\nCentar",
      startsAt,
      dentistName: "Mina Minić",
      address: "Knez Mihailova 1",
      phone: "011123456",
    });

    expect(message.subject).toBe("Termin je pomeren");
    expect(message.text).toBe(`Novi termin: ${when}, Mina Minić, Knez Mihailova 1. Telefon: 011123456.`);
  });

  it("sends those subjects from accept, reject, offer, and staff cancel", () => {
    const appointments = readFileSync(path.join(process.cwd(), "app/actions/appointments.ts"), "utf8");
    const mail = readFileSync(path.join(process.cwd(), "lib/mail.ts"), "utf8");
    const accept = exportedFunction(appointments, "acceptRequest");
    const reject = exportedFunction(appointments, "rejectRequest");
    const offer = exportedFunction(appointments, "sendOffer");
    const status = exportedFunction(appointments, "setAppointmentStatus");
    const moved = exportedFunction(appointments, "updateAppointment");

    expect(accept.indexOf("appointmentConfirmedMessage")).toBeGreaterThan(accept.lastIndexOf('status: "accepted"'));
    expect(accept).toContain("to: request.bookerEmail");
    expect(reject.indexOf("requestRejectedMessage")).toBeGreaterThan(reject.lastIndexOf('status: "rejected"'));
    expect(reject).toContain("to: request.bookerEmail");
    expect(offer.indexOf("offeredTimesMessage")).toBeGreaterThan(offer.lastIndexOf('status: "offered"'));
    expect(offer).toContain("to: request.bookerEmail");
    expect(offer).toContain("prepareOfferedNotice");
    expect(sourceFunction(appointments, "function offerChoiceLink")).toContain("/zakazivanje/");

    const cancelAt = status.indexOf('parsed.data.status === "cancelled" && patientId && startsAt');
    expect(status.indexOf("appointmentCancelledMessage")).toBeGreaterThan(cancelAt);
    expect(cancelAt).toBeGreaterThan(-1);
    expect(status).toContain("readCancelledNotice");
    expect(sourceFunction(appointments, "async function readCancelledNotice")).toContain("readPatientMailbox");

    expect(moved).toContain("sendMovedAppointment");
    expect(moved).not.toContain("sendStaffMail");
    expect(moved).not.toContain("appointmentConfirmedMessage");
    expect(moved).not.toContain("requestRejectedMessage");
    expect(moved).not.toContain("appointmentCancelledMessage");
    expect(moved).not.toContain("offeredTimesMessage");

    for (const forbidden of ["Zahtev je istekao", "Podsetnik za sutra", "Termin je za dva sata"]) {
      expect(mail).not.toContain(forbidden);
      expect(appointments).not.toContain(forbidden);
    }
  });
});

function exportedFunction(source: string, name: string): string {
  return sourceFunction(source, `export async function ${name}`);
}

function sourceFunction(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) return "";
  const match = /\n(?:export )?async function |\nfunction /.exec(source.slice(start + marker.length));
  const end = match ? start + marker.length + match.index : source.length;
  return source.slice(start, end);
}
