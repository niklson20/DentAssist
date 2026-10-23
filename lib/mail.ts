import { Resend } from "resend";

import { formatBelgrade } from "@/lib/calendar-dates";

export const REQUEST_RECEIVED_SUBJECT = "Zahtev je primljen";
export const APPOINTMENT_MOVED_SUBJECT = "Termin je pomeren";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  /** Clinic name on appointment mail. Account mail omits it and stays DentAssist. */
  fromName?: string;
};

export type RequestReceivedInput = {
  to: string;
  clinicName: string;
  patientName: string;
  startsAt: string;
  dentistName: string;
  address: string;
  phone: string;
};

export type AppointmentMovedInput = {
  to: string;
  clinicName: string;
  startsAt: string;
  dentistName: string;
  address: string;
  phone: string;
};

export class MailError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("sendMail failed");
    this.name = "MailError";
    this.code = code;
  }
}

export async function sendMail(mail: MailMessage): Promise<void> {
  if (!mail.to.trim() || !mail.subject.trim() || !mail.text.trim()) {
    throw new Error("sendMail is not configured");
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.MAIL_FROM?.trim();
  if (!apiKey || !fromAddress) {
    throw new Error("sendMail is not configured");
  }

  const from = mailFrom(mail.fromName, fromAddress);
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
  if (error) {
    throw new MailError(error.name);
  }
}

/** „Zahtev je primljen“. The clinic is not a recipient; its phone is in the body. */
export function requestReceivedMessage(input: RequestReceivedInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const patientName = oneLine(input.patientName);
  const when = oneLine(formatAppointmentWhen(input.startsAt));
  const dentistName = oneLine(input.dentistName);
  const address = oneLine(input.address);
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: REQUEST_RECEIVED_SUBJECT,
    fromName: clinicName,
    text: `Zahtev za termin je primljen. ${clinicName} treba da ga potvrdi. ${patientName}, ${when}, ${dentistName}, ${address}. Telefon: ${phone}.`,
  };
}

/** „Termin je pomeren“. Sent only when the clinic changes the start time. */
export function appointmentMovedMessage(input: AppointmentMovedInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const when = oneLine(formatAppointmentWhen(input.startsAt));
  const dentistName = oneLine(input.dentistName);
  const address = oneLine(input.address);
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: APPOINTMENT_MOVED_SUBJECT,
    fromName: clinicName,
    text: `Novi termin: ${when}, ${dentistName}, ${address}. Telefon: ${phone}.`,
  };
}

export function formatAppointmentWhen(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    return "";
  }
  const day = formatBelgrade(start, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function mailFrom(fromName: string | undefined, fromAddress: string): string {
  const name = oneLine(fromName ?? "");
  if (!name) {
    return fromAddress.includes("<") ? fromAddress : `DentAssist <${fromAddress}>`;
  }
  return `${quotedDisplayName(name)} <${mailbox(fromAddress)}>`;
}

function mailbox(fromAddress: string): string {
  const wrapped = fromAddress.match(/<([^<>]+)>/);
  return (wrapped?.[1] ?? fromAddress).trim();
}

function quotedDisplayName(name: string): string {
  if (/^[\p{L}\p{N} .&'+-]+$/u.test(name)) {
    return name;
  }
  return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
