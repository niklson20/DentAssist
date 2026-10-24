import type { SupabaseClient } from "@supabase/supabase-js";
import { createTransport } from "nodemailer";
import { Resend } from "resend";

import { formatBelgrade } from "@/lib/calendar-dates";

export const REQUEST_RECEIVED_SUBJECT = "Zahtev je primljen";
export const APPOINTMENT_CONFIRMED_SUBJECT = "Termin je potvrđen";
export const REQUEST_REJECTED_SUBJECT = "Zahtev nije prihvaćen";
export const APPOINTMENT_CANCELLED_SUBJECT = "Termin je otkazan";
export const OFFERED_TIMES_SUBJECT = "Ponuđeni termini";
export const APPOINTMENT_MOVED_SUBJECT = "Termin je pomeren";
export const REMINDER_TOMORROW_SUBJECT = "Podsetnik za sutra";
export const REMINDER_SOON_SUBJECT = "Termin je za dva sata";

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

export type AppointmentConfirmedInput = {
  to: string;
  clinicName: string;
  patientName: string;
  startsAt: string;
  dentistName: string;
  address: string;
  phone: string;
};

export type RequestRejectedInput = {
  to: string;
  clinicName: string;
  message: string;
  phone: string;
};

export type AppointmentCancelledInput = {
  to: string;
  clinicName: string;
  startsAt: string;
  message: string;
  phone: string;
};

export type OfferedTimesInput = {
  to: string;
  clinicName: string;
  dentistName: string;
  link: string;
  deadlineAt: string;
  phone: string;
};

export type ReminderTomorrowInput = {
  to: string;
  clinicName: string;
  startsAt: string;
  dentistName: string;
  address: string;
  phone: string;
};

export type ReminderSoonInput = {
  to: string;
  clinicName: string;
  startsAt: string;
  dentistName: string;
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

  const gmailUser = process.env.mail_test?.trim() ?? "";
  const gmailPassword = process.env.mail_password?.replace(/\s+/g, "") ?? "";
  if (gmailUser && gmailPassword) {
    await sendWithGmail(mail, gmailUser, gmailPassword);
    return;
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

/** Gmail SMTP while `mail_test` and `mail_password` are set. The mailbox is that Gmail address. */
async function sendWithGmail(mail: MailMessage, user: string, password: string): Promise<void> {
  const from = mailFrom(mail.fromName, user);
  const transport = createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: password },
  });
  try {
    await transport.sendMail({
      from,
      to: mail.to.trim(),
      subject: mail.subject,
      text: mail.text,
    });
  } catch (error) {
    throw gmailFailure(error);
  }
}

function gmailFailure(error: unknown): MailError {
  const response =
    error && typeof error === "object" && "response" in error && typeof error.response === "string"
      ? error.response
      : error instanceof Error
        ? error.message
        : "";
  if (/5\.4\.5|4\.7\.0|daily user sending (quota|limit)/i.test(response)) {
    return new MailError("rate_limit_exceeded");
  }
  const line = response.split(/\r?\n/).find((part) => part.trim()) ?? "unknown";
  console.error("Gmail SMTP failed:", line);
  return new MailError("gmail_smtp");
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

/** „Termin je potvrđen“. The clinic is not a recipient; its phone is in the body. */
export function appointmentConfirmedMessage(input: AppointmentConfirmedInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const patientName = oneLine(input.patientName);
  const when = oneLine(formatAppointmentWhen(input.startsAt));
  const dentistName = oneLine(input.dentistName);
  const address = oneLine(input.address);
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: APPOINTMENT_CONFIRMED_SUBJECT,
    fromName: clinicName,
    text: `Termin je potvrđen. ${patientName}, ${when}, ${dentistName}, ${address}. Telefon: ${phone}.`,
  };
}

/** „Zahtev nije prihvaćen“. The clinic is not a recipient. An empty note is left out. */
export function requestRejectedMessage(input: RequestRejectedInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: REQUEST_REJECTED_SUBJECT,
    fromName: clinicName,
    text: `${clinicName} ne može da primi ovaj termin. ${optionalSentence(input.message)}Telefon: ${phone}.`,
  };
}

/** „Termin je otkazan“. Sent when the clinic cancels. The clinic is not a recipient. */
export function appointmentCancelledMessage(input: AppointmentCancelledInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const when = oneLine(formatAppointmentWhen(input.startsAt));
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: APPOINTMENT_CANCELLED_SUBJECT,
    fromName: clinicName,
    text: `Termin ${when} je otkazan. ${optionalSentence(input.message)}Telefon: ${phone}.`,
  };
}

/** „Ponuđeni termini“. The clinic is not a recipient. */
export function offeredTimesMessage(input: OfferedTimesInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const dentistName = oneLine(input.dentistName);
  const link = oneLine(input.link);
  const deadline = oneLine(formatAppointmentWhen(input.deadlineAt));
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: OFFERED_TIMES_SUBJECT,
    fromName: clinicName,
    text: `${clinicName} nudi druga vremena kod ${dentistName}. Izaberite jedan, ili javite da nijedan ne odgovara: ${link}. Rok za izbor: ${deadline}. Telefon: ${phone}.`,
  };
}

/** „Podsetnik za sutra“. The clinic is not a recipient; its phone is in the body. */
export function reminderTomorrowMessage(input: ReminderTomorrowInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const time = oneLine(formatAppointmentClock(input.startsAt));
  const dentistName = oneLine(input.dentistName);
  const address = oneLine(input.address);
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: REMINDER_TOMORROW_SUBJECT,
    fromName: clinicName,
    text: `Sutra: ${time}, ${dentistName}, ${address}. Telefon: ${phone}.`,
  };
}

/** „Termin je za dva sata“. The clinic is not a recipient; its phone is in the body. */
export function reminderSoonMessage(input: ReminderSoonInput): MailMessage {
  const clinicName = oneLine(input.clinicName);
  const time = oneLine(formatAppointmentClock(input.startsAt));
  const dentistName = oneLine(input.dentistName);
  const phone = oneLine(input.phone);
  return {
    to: input.to.trim(),
    subject: REMINDER_SOON_SUBJECT,
    fromName: clinicName,
    text: `Termin je u ${time}, ${dentistName}. Promena se radi telefonom: ${phone}.`,
  };
}

const REMINDER_AHEAD_MS = {
  "24h": 24 * 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
} as const;

type ReminderKind = keyof typeof REMINDER_AHEAD_MS;

type DueReminder = {
  appointmentId: string;
  clinicId: string;
  kind: ReminderKind;
  startsAt: string;
};

/**
 * Sends reminders chosen by the database function and records each one.
 * Returns true when a send or a write failed.
 */
export async function due_reminders(supabase: SupabaseClient): Promise<boolean> {
  let rows: DueReminder[];
  try {
    const listed = await supabase.rpc("due_reminders");
    if (listed.error) {
      console.error("due_reminders rejected:", listed.error.code ?? "unknown");
      return true;
    }
    rows = dueRows(listed.data);
  } catch (error) {
    console.error("due_reminders failed:", error instanceof Error ? error.name : "unknown error");
    return true;
  }

  const claimed = new Set<string>();
  let failed = false;
  for (const row of rows) {
    const key = `${row.appointmentId}:${row.kind}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    try {
      await deliverReminder(supabase, row);
    } catch (error) {
      claimed.delete(key);
      console.error("due_reminders failed:", error instanceof Error ? error.name : "unknown error");
      failed = true;
    }
  }
  return failed;
}

async function deliverReminder(supabase: SupabaseClient, row: DueReminder): Promise<void> {
  const existing = await readRow(supabase, "appointment_reminders", "appointment_id", [
    ["appointment_id", row.appointmentId],
    ["kind", row.kind],
  ]);
  if (existing) return;

  const appointment = await readRow(
    supabase,
    "appointments",
    "patient_id, dentist_id, booking_request_id, starts_at, confirmed_at, created_at, status",
    [
      ["id", row.appointmentId],
      ["clinic_id", row.clinicId],
    ],
  );
  if (!appointment || textOf(appointment.status) !== "scheduled") return;

  const startsAt = textOf(appointment.starts_at) || row.startsAt;
  if (!reminderStillDue(startsAt, textOf(appointment.confirmed_at), textOf(appointment.created_at), row.kind)) {
    return;
  }

  const clinic = await readRow(supabase, "clinics", "name, address, phone", [["id", row.clinicId]]);
  const dentistId = textOf(appointment.dentist_id);
  const dentist = dentistId
    ? await readRow(supabase, "clinic_members", "first_name, last_name", [
        ["id", dentistId],
        ["clinic_id", row.clinicId],
      ])
    : null;
  const dentistName = `${textOf(dentist?.first_name)} ${textOf(dentist?.last_name)}`.replace(/\s+/g, " ").trim();
  const clinicName = textOf(clinic?.name);
  const phone = textOf(clinic?.phone);
  const address = textOf(clinic?.address);
  const to = await reminderRecipient(
    supabase,
    row.clinicId,
    textOf(appointment.patient_id),
    textOf(appointment.booking_request_id),
  );
  if (!to || !clinicName || !dentistName || !phone || (row.kind === "24h" && !address)) return;

  const message =
    row.kind === "24h"
      ? reminderTomorrowMessage({ to, clinicName, startsAt, dentistName, address, phone })
      : reminderSoonMessage({ to, clinicName, startsAt, dentistName, phone });
  await sendMail(message);

  const saved = await supabase.from("appointment_reminders").insert({
    appointment_id: row.appointmentId,
    clinic_id: row.clinicId,
    kind: row.kind,
  });
  if (saved.error && saved.error.code !== "23505") {
    console.error("appointment_reminders rejected:", saved.error.code ?? "unknown");
    throw new Error("appointment_reminders rejected");
  }
}

function reminderStillDue(startsAt: string, confirmedAt: string, createdAt: string, kind: ReminderKind): boolean {
  const start = new Date(startsAt).getTime();
  const now = Date.now();
  if (Number.isNaN(start) || start <= now) return false;
  const moment = start - REMINDER_AHEAD_MS[kind];
  if (now < moment) return false;
  const confirmed = new Date(confirmedAt || createdAt).getTime();
  if (Number.isNaN(confirmed)) return false;
  return confirmed <= moment;
}

async function reminderRecipient(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  bookingRequestId: string,
): Promise<string | null> {
  if (bookingRequestId) {
    const request = await readRow(supabase, "booking_requests", "booker_email", [
      ["id", bookingRequestId],
      ["clinic_id", clinicId],
    ]);
    const booker = recipientAddress(request?.booker_email);
    if (booker) return booker;
  }
  if (!patientId) return null;
  const patient = await readRow(supabase, "patients", "email", [
    ["id", patientId],
    ["clinic_id", clinicId],
  ]);
  const patientEmail = recipientAddress(patient?.email);
  if (patientEmail) return patientEmail;
  const contact = await readFirst(supabase, "patient_contacts", "email", [
    ["patient_id", patientId],
    ["clinic_id", clinicId],
  ]);
  return recipientAddress(contact?.email);
}

async function readRow(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filters: Array<[string, string]>,
): Promise<Record<string, unknown> | null> {
  let query = supabase.from(table).select(columns);
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const result = await query.maybeSingle();
  if (result.error) {
    console.error(`${table} rejected:`, result.error.code ?? "unknown");
    throw new Error(`${table} rejected`);
  }
  return recordOf(result.data);
}

async function readFirst(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filters: Array<[string, string]>,
): Promise<Record<string, unknown> | null> {
  let query = supabase.from(table).select(columns);
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const result = await query.limit(1);
  if (result.error) {
    console.error(`${table} rejected:`, result.error.code ?? "unknown");
    throw new Error(`${table} rejected`);
  }
  const rows = Array.isArray(result.data) ? result.data : [];
  return recordOf(rows[0]);
}

function dueRows(data: unknown): DueReminder[] {
  if (!Array.isArray(data)) return [];
  const rows: DueReminder[] = [];
  for (const item of data) {
    const record = recordOf(item);
    if (!record) continue;
    const appointmentId = textOf(record.appointment_id);
    const clinicId = textOf(record.clinic_id);
    const kind = textOf(record.kind);
    const startsAt = textOf(record.starts_at);
    if (!appointmentId || !clinicId || !startsAt || (kind !== "24h" && kind !== "2h")) continue;
    rows.push({ appointmentId, clinicId, kind, startsAt });
  }
  return rows;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recipientAddress(value: unknown): string | null {
  const email = textOf(value).toLowerCase();
  return email.includes("@") ? email : null;
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
  const time = formatAppointmentClock(startsAt);
  return `${day}, ${time}`;
}

function formatAppointmentClock(startsAt: string): string {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "";
  return formatBelgrade(start, { hour: "2-digit", minute: "2-digit" });
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

function optionalSentence(value: string): string {
  const text = oneLine(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? `${text} ` : `${text}. `;
}
