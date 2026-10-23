"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember, type MemberSession } from "@/lib/auth";
import { formatBelgradeDate, hasTurned15, isIsoDate, parseBelgradeLocal } from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES, RELATIONSHIPS } from "@/lib/labels";
import { appointmentMovedMessage, MailError, sendMail } from "@/lib/mail";
import { normalizePhone } from "@/lib/phone";
import {
  insertGuardianContact,
  insertStaffAppointment,
  readAppointmentFacts,
} from "@/lib/queries/appointments";
import { appointmentsOverlap } from "@/lib/slots";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CHECK = "Proverite unete podatke.";
const SAVE_UNAVAILABLE = "Čuvanje trenutno nije moguće. Pokušajte ponovo.";
const EARLIER_DAY = "Raniji dan ne može.";
const DENTIST_UNAVAILABLE = "Stomatolog je nedostupan.";
const DENTIST_BUSY = "Stomatolog već ima termin u tom vremenu.";
const CONTACT_REQUIRED =
  "Pacijent mlađi od 15 godina mora imati kontakt roditelja ili srodnika.";
const PICK_DENTIST = "Izaberite stomatologa.";
const PICK_PATIENT = "Izaberite pacijenta.";
const PICK_TYPE = "Izaberite tip.";
const PICK_START = "Unesite početak.";
const PICK_DURATION = "Unesite trajanje.";
const DURATION_STEP = "Trajanje je umnožak koraka, najviše 120 minuta.";
const START_STEP = "Početak mora da bude na koraku ordinacije.";
const NOTE_MAX = "Napomena može imati najviše 1000 znakova.";
const PICK_DAY = "Izaberite dan.";
const PICK_END = "Unesite kraj.";
const END_AFTER_START = "Kraj mora biti posle početka.";
const REASON_MAX = "Razlog može imati najviše 200 znakova.";
const PICK_APPOINTMENT = "Izaberite termin.";
const PICK_STATUS = "Izaberite status.";
const CANCEL_NOTE = "Otkaz zakazanog termina traži poruku.";
const CANCEL_NOTE_MAX = "Poruka može imati najviše 300 znakova.";
const COMPLETED_ONLY =
  "Samo stomatolog tog termina i vlasnik mogu da označe termin završenim.";
const APPOINTMENT_MISSING = "Termin nije pronađen.";
const ONLY_SCHEDULED = "Samo zakazan termin može da se izmeni.";
const STAFF_STATUS_CHANGES = ["no_show", "cancelled", "completed"] as const;
const BLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const appointmentSchema = z.object({
  stomatolog: z.string({ error: PICK_DENTIST }).trim().uuid(PICK_DENTIST),
  pacijent: z.string({ error: PICK_PATIENT }).trim().uuid(PICK_PATIENT),
  pocetak: z.string({ error: PICK_START }).trim().min(1, PICK_START),
  trajanje: z
    .string({ error: PICK_DURATION })
    .trim()
    .regex(/^\d+$/, PICK_DURATION)
    .transform((value) => Number(value)),
  tip: z.string({ error: PICK_TYPE }).trim().uuid(PICK_TYPE),
  napomena: z.string().trim().max(1000, NOTE_MAX),
  kontaktOdnos: z.string().trim(),
  kontaktIme: z.string().trim(),
  kontaktPrezime: z.string().trim(),
  kontaktTelefon: z.string().trim(),
  kontaktMejl: z.string().trim(),
});

const updateSchema = appointmentSchema.extend({
  termin: z.string({ error: PICK_APPOINTMENT }).trim().uuid(PICK_APPOINTMENT),
});

const blockSchema = z.object({
  stomatolog: z.string({ error: PICK_DENTIST }).trim().uuid(PICK_DENTIST),
  datum: z
    .string({ error: PICK_DAY })
    .trim()
    .refine((value) => isIsoDate(value), PICK_DAY),
  pocetak: z.string({ error: PICK_START }).trim().regex(BLOCK_TIME, PICK_START),
  kraj: z.string({ error: PICK_END }).trim().regex(BLOCK_TIME, PICK_END),
  razlog: z.string().trim().max(200, REASON_MAX),
});

const statusSchema = z.object({
  termin: z.string({ error: PICK_APPOINTMENT }).trim().uuid(PICK_APPOINTMENT),
  status: z.enum(STAFF_STATUS_CHANGES, { error: PICK_STATUS }),
  poruka: z.string().trim().max(300, CANCEL_NOTE_MAX),
});

const contactSchema = z.object({
  kontaktOdnos: z.enum(RELATIONSHIPS, { error: "Izaberite odnos." }),
  kontaktIme: z
    .string()
    .trim()
    .min(1, "Unesite ime.")
    .max(80, "Ime može imati najviše 80 znakova."),
  kontaktPrezime: z
    .string()
    .trim()
    .min(1, "Unesite prezime.")
    .max(80, "Prezime može imati najviše 80 znakova."),
  kontaktTelefon: z
    .string()
    .trim()
    .min(1, "Unesite telefon.")
    .refine((value) => normalizePhone(value) !== null, "Unesite ispravan telefon."),
  kontaktMejl: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, "Unesite ispravan mejl."),
});

export async function createAppointment(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = appointmentSchema.safeParse(readAppointmentFields(formData));
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const clock = localClock(parsed.data.pocetak);
  if (!clock) {
    return fail(CHECK, { pocetak: [PICK_START] });
  }

  const member = await requireMember();
  const today = formatBelgradeDate(new Date());
  if (clock.day < today) {
    return fail(EARLIER_DAY, { pocetak: [EARLIER_DAY] });
  }

  const startsAt = parseBelgradeLocal(parsed.data.pocetak);
  const endsAt = new Date(startsAt.getTime() + parsed.data.trajanje * 60_000);

  try {
    const supabase = await createSupabaseServerClient();
    const read = await readAppointmentFacts(supabase, {
      clinicId: member.clinicId,
      dentistId: parsed.data.stomatolog,
      patientId: parsed.data.pacijent,
      appointmentTypeId: parsed.data.tip,
      startsAt,
      endsAt,
    });
    if (!read.ok) {
      if (read.reason === "dentist") return fail(CHECK, { stomatolog: [PICK_DENTIST] });
      if (read.reason === "patient") return fail(CHECK, { pacijent: [PICK_PATIENT] });
      if (read.reason === "type") return fail(CHECK, { tip: [PICK_TYPE] });
      return fail(SAVE_UNAVAILABLE);
    }

    const { facts } = read;
    if (
      parsed.data.trajanje < facts.slotMinutes ||
      parsed.data.trajanje > 120 ||
      parsed.data.trajanje % facts.slotMinutes !== 0
    ) {
      return fail(CHECK, { trajanje: [DURATION_STEP] });
    }
    if (clock.second !== 0 || (clock.hour * 60 + clock.minute) % facts.slotMinutes !== 0) {
      return fail(CHECK, { pocetak: [START_STEP] });
    }

    // Staff may save outside working hours. Unavailability and another appointment of this dentist still block it.
    if (facts.unavailable) {
      return fail(DENTIST_UNAVAILABLE);
    }

    const under15 = facts.dateOfBirth !== null && !hasTurned15(facts.dateOfBirth, today);
    let contact: {
      relationship: z.infer<typeof contactSchema>["kontaktOdnos"];
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
    } | null = null;
    if (under15 && !facts.hasContact) {
      const parsedContact = contactSchema.safeParse(parsed.data);
      if (!parsedContact.success) {
        return fail(CONTACT_REQUIRED, fieldErrorsFrom(parsedContact.error));
      }
      const phone = normalizePhone(parsedContact.data.kontaktTelefon);
      if (!phone) {
        return fail(CONTACT_REQUIRED, { kontaktTelefon: ["Unesite ispravan telefon."] });
      }
      contact = {
        relationship: parsedContact.data.kontaktOdnos,
        firstName: parsedContact.data.kontaktIme,
        lastName: parsedContact.data.kontaktPrezime,
        phone,
        email: parsedContact.data.kontaktMejl === "" ? null : parsedContact.data.kontaktMejl.toLowerCase(),
      };
    }

    if (facts.overlapping) {
      return fail(DENTIST_BUSY);
    }

    if (contact) {
      const savedContact = await insertGuardianContact(supabase, {
        clinicId: member.clinicId,
        patientId: parsed.data.pacijent,
        relationship: contact.relationship,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
      });
      if (!savedContact) return fail(SAVE_UNAVAILABLE);
    }

    const saved = await insertStaffAppointment(supabase, {
      clinicId: member.clinicId,
      dentistId: parsed.data.stomatolog,
      patientId: parsed.data.pacijent,
      appointmentTypeId: parsed.data.tip,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      note: parsed.data.napomena === "" ? null : parsed.data.napomena,
    });
    if (!saved.ok) return fail(saved.conflict ? DENTIST_BUSY : SAVE_UNAVAILABLE);

    revalidatePath("/danas");
    return ok({ id: saved.id });
  } catch (error) {
    console.error("create_appointment failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function updateAppointment(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateSchema.safeParse({
    ...readAppointmentFields(formData),
    termin: text(formData.get("termin")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const clock = localClock(parsed.data.pocetak);
  if (!clock) {
    return fail(CHECK, { pocetak: [PICK_START] });
  }

  const member = await requireMember();
  const today = formatBelgradeDate(new Date());
  if (clock.day < today) {
    return fail(EARLIER_DAY, { pocetak: [EARLIER_DAY] });
  }

  const startsAt = parseBelgradeLocal(parsed.data.pocetak);
  const endsAt = new Date(startsAt.getTime() + parsed.data.trajanje * 60_000);

  try {
    const supabase = await createSupabaseServerClient();
    const loaded = await supabase
      .from("appointments")
      .select("id, status, starts_at")
      .eq("id", parsed.data.termin)
      .eq("clinic_id", member.clinicId)
      .maybeSingle();

    if (loaded.error) {
      console.error("update_appointment_read rejected:", "unknown");
      return fail(SAVE_UNAVAILABLE);
    }

    const current = loaded.data;
    if (!current || typeof current.id !== "string") return fail(APPOINTMENT_MISSING);
    if (typeof current.status !== "string" || typeof current.starts_at !== "string") {
      return fail(SAVE_UNAVAILABLE);
    }
    if (current.status !== "scheduled") return fail(ONLY_SCHEDULED);

    const read = await readAppointmentFacts(supabase, {
      clinicId: member.clinicId,
      dentistId: parsed.data.stomatolog,
      patientId: parsed.data.pacijent,
      appointmentTypeId: parsed.data.tip,
      startsAt,
      endsAt,
    });
    if (!read.ok) {
      if (read.reason === "dentist") return fail(CHECK, { stomatolog: [PICK_DENTIST] });
      if (read.reason === "patient") return fail(CHECK, { pacijent: [PICK_PATIENT] });
      if (read.reason === "type") return fail(CHECK, { tip: [PICK_TYPE] });
      return fail(SAVE_UNAVAILABLE);
    }

    const { facts } = read;
    if (
      parsed.data.trajanje < facts.slotMinutes ||
      parsed.data.trajanje > 120 ||
      parsed.data.trajanje % facts.slotMinutes !== 0
    ) {
      return fail(CHECK, { trajanje: [DURATION_STEP] });
    }
    if (clock.second !== 0 || (clock.hour * 60 + clock.minute) % facts.slotMinutes !== 0) {
      return fail(CHECK, { pocetak: [START_STEP] });
    }

    // Staff may save outside working hours. Unavailability and another appointment of this dentist still block it.
    if (facts.unavailable) {
      return fail(DENTIST_UNAVAILABLE);
    }

    const under15 = facts.dateOfBirth !== null && !hasTurned15(facts.dateOfBirth, today);
    let contact: {
      relationship: z.infer<typeof contactSchema>["kontaktOdnos"];
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
    } | null = null;
    if (under15 && !facts.hasContact) {
      const parsedContact = contactSchema.safeParse(parsed.data);
      if (!parsedContact.success) {
        return fail(CONTACT_REQUIRED, fieldErrorsFrom(parsedContact.error));
      }
      const phone = normalizePhone(parsedContact.data.kontaktTelefon);
      if (!phone) {
        return fail(CONTACT_REQUIRED, { kontaktTelefon: ["Unesite ispravan telefon."] });
      }
      contact = {
        relationship: parsedContact.data.kontaktOdnos,
        firstName: parsedContact.data.kontaktIme,
        lastName: parsedContact.data.kontaktPrezime,
        phone,
        email: parsedContact.data.kontaktMejl === "" ? null : parsedContact.data.kontaktMejl.toLowerCase(),
      };
    }

    const occupied = await supabase
      .from("appointments")
      .select("id, dentist_id, starts_at, ends_at, status")
      .eq("clinic_id", member.clinicId)
      .eq("dentist_id", parsed.data.stomatolog)
      .lt("starts_at", endsAt.toISOString())
      .gt("ends_at", startsAt.toISOString());
    if (occupied.error) {
      console.error("update_appointment_overlap rejected:", "unknown");
      return fail(SAVE_UNAVAILABLE);
    }
    const overlap = otherAppointmentOverlaps(
      current.id,
      parsed.data.stomatolog,
      startsAt,
      endsAt,
      occupied.data,
    );
    if (overlap === null) return fail(SAVE_UNAVAILABLE);
    if (overlap) return fail(DENTIST_BUSY);

    if (contact) {
      const savedContact = await insertGuardianContact(supabase, {
        clinicId: member.clinicId,
        patientId: parsed.data.pacijent,
        relationship: contact.relationship,
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        email: contact.email,
      });
      if (!savedContact) return fail(SAVE_UNAVAILABLE);
    }

    const saved = await supabase
      .from("appointments")
      .update({
        dentist_id: parsed.data.stomatolog,
        patient_id: parsed.data.pacijent,
        appointment_type_id: parsed.data.tip,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        note: parsed.data.napomena === "" ? null : parsed.data.napomena,
      })
      .eq("id", current.id)
      .eq("clinic_id", member.clinicId)
      .select("id")
      .maybeSingle();

    const savedId = saved.data && typeof saved.data.id === "string" ? saved.data.id : null;
    if (saved.error || !savedId) {
      console.error("update_appointment rejected:", saved.error ? "unknown" : "empty");
      return fail(isExclusionConflict(saved.error) ? DENTIST_BUSY : SAVE_UNAVAILABLE);
    }

    // A new start time emails the patient and does not spend their one reschedule.
    // Moving only the dentist does not send mail.
    if (!sameInstant(current.starts_at, startsAt)) {
      await sendMovedAppointment(supabase, {
        clinicId: member.clinicId,
        patientId: parsed.data.pacijent,
        dentistId: parsed.data.stomatolog,
        startsAt: startsAt.toISOString(),
      });
    }

    revalidatePath("/danas");
    return ok({ id: savedId });
  } catch (error) {
    console.error("update_appointment failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function createBlock(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = blockSchema.safeParse(readBlockFields(formData));
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const startsAt = localInstant(parsed.data.datum, parsed.data.pocetak);
  const endsAt = localInstant(parsed.data.datum, parsed.data.kraj);
  if (!startsAt || !endsAt) {
    return fail(CHECK, { pocetak: [PICK_START], kraj: [PICK_END] });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return fail(CHECK, { kraj: [END_AFTER_START] });
  }

  const member = await requireMember();

  try {
    const supabase = await createSupabaseServerClient();
    const dentist = await supabase
      .from("clinic_members")
      .select("role, sees_patients")
      .eq("id", parsed.data.stomatolog)
      .eq("clinic_id", member.clinicId)
      .maybeSingle();

    if (dentist.error) {
      console.error("create_block_dentist rejected:", "unknown");
      return fail(SAVE_UNAVAILABLE);
    }

    const dentistRow = dentist.data;
    if (
      !dentistRow ||
      (dentistRow.role !== "dentist" && dentistRow.role !== "owner") ||
      dentistRow.sees_patients !== true
    ) {
      return fail(CHECK, { stomatolog: [PICK_DENTIST] });
    }

    const saved = await supabase
      .from("blocked_periods")
      .insert({
        clinic_id: member.clinicId,
        clinic_member_id: parsed.data.stomatolog,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        reason: parsed.data.razlog === "" ? null : parsed.data.razlog,
      })
      .select("id")
      .single();

    const id = saved.data && typeof saved.data.id === "string" ? saved.data.id : null;
    if (saved.error || !id) {
      console.error("create_block rejected:", saved.error ? "unknown" : "empty");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath("/danas");
    return ok({ id });
  } catch (error) {
    console.error("create_block failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function setAppointmentStatus(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = statusSchema.safeParse(readStatusFields(formData));
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const member = await requireMember();

  try {
    const supabase = await createSupabaseServerClient();
    const loaded = await supabase
      .from("appointments")
      .select("id, status, dentist_id")
      .eq("id", parsed.data.termin)
      .eq("clinic_id", member.clinicId)
      .maybeSingle();

    if (loaded.error) {
      console.error("set_appointment_status_read rejected:", "unknown");
      return fail(SAVE_UNAVAILABLE);
    }

    const row = loaded.data;
    if (!row) return fail(APPOINTMENT_MISSING);
    const status = APPOINTMENT_STATUSES.find((item) => item === row.status);
    const dentistId = typeof row.dentist_id === "string" ? row.dentist_id : null;
    const id = typeof row.id === "string" ? row.id : null;
    if (!status || !dentistId || !id) return fail(SAVE_UNAVAILABLE);

    if (parsed.data.status === "cancelled" && status === "scheduled" && parsed.data.poruka === "") {
      return fail(CHECK, { poruka: [CANCEL_NOTE] });
    }

    if (parsed.data.status === "completed") {
      const denied = await denyUnlessCanComplete(supabase, member, dentistId);
      if (denied) return denied;
    }

    const changes =
      parsed.data.status === "cancelled"
        ? {
            status: parsed.data.status,
            cancelled_by: "staff",
            cancellation_note: parsed.data.poruka === "" ? null : parsed.data.poruka,
          }
        : { status: parsed.data.status };

    const saved = await supabase
      .from("appointments")
      .update(changes)
      .eq("id", id)
      .eq("clinic_id", member.clinicId)
      .select("id")
      .maybeSingle();

    const savedId = saved.data && typeof saved.data.id === "string" ? saved.data.id : null;
    if (saved.error || !savedId) {
      console.error("set_appointment_status rejected:", saved.error ? "unknown" : "empty");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath("/danas");
    return ok({ id: savedId });
  } catch (error) {
    console.error("set_appointment_status failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }
}

function readBlockFields(formData: FormData) {
  return {
    stomatolog: text(formData.get("stomatolog")),
    datum: text(formData.get("datum")),
    pocetak: text(formData.get("pocetak")),
    kraj: text(formData.get("kraj")),
    razlog: text(formData.get("razlog")),
  };
}

function localInstant(day: string, time: string): Date | null {
  const value = `${day}T${time}`;
  if (!localClock(value)) return null;
  return parseBelgradeLocal(value);
}

function readStatusFields(formData: FormData) {
  return {
    termin: text(formData.get("termin")),
    status: text(formData.get("status")),
    poruka: text(formData.get("poruka")),
  };
}

async function denyUnlessCanComplete(
  supabase: SupabaseClient,
  member: MemberSession,
  dentistId: string,
): Promise<ActionResult<never> | null> {
  if (member.role === "owner") return null;
  if (member.role !== "dentist") return fail(COMPLETED_ONLY);

  const self = await supabase
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", member.clinicId)
    .eq("user_id", member.userId)
    .maybeSingle();

  if (self.error) {
    console.error("set_appointment_status_member rejected:", "unknown");
    return fail(SAVE_UNAVAILABLE);
  }

  const memberId = self.data && typeof self.data.id === "string" ? self.data.id : null;
  if (memberId !== dentistId) return fail(COMPLETED_ONLY);
  return null;
}

function readAppointmentFields(formData: FormData) {
  return {
    stomatolog: text(formData.get("stomatolog")),
    pacijent: text(formData.get("pacijent")),
    pocetak: text(formData.get("pocetak")),
    trajanje: text(formData.get("trajanje")),
    tip: text(formData.get("tip")),
    napomena: text(formData.get("napomena")),
    kontaktOdnos: text(formData.get("kontaktOdnos")),
    kontaktIme: text(formData.get("kontaktIme")),
    kontaktPrezime: text(formData.get("kontaktPrezime")),
    kontaktTelefon: text(formData.get("kontaktTelefon")),
    kontaktMejl: text(formData.get("kontaktMejl")),
  };
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

function localClock(
  value: string,
): { day: string; hour: number; minute: number; second: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || !isIsoDate(match[1])) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { day: match[1], hour, minute, second };
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (result[field] ??= []).push(issue.message);
  }
  return result;
}

function otherAppointmentOverlaps(
  appointmentId: string,
  dentistId: string,
  startsAt: Date,
  endsAt: Date,
  rows: unknown,
): boolean | null {
  if (!Array.isArray(rows)) return null;
  const next = { dentistId, startsAt, endsAt, status: "scheduled" as const };
  for (const item of rows) {
    const row = recordOf(item);
    if (!row) return null;
    if (row.id === appointmentId) continue;
    if (typeof row.id !== "string" || typeof row.dentist_id !== "string") return null;
    const status = APPOINTMENT_STATUSES.find((value) => value === row.status);
    if (!status || typeof row.starts_at !== "string" || typeof row.ends_at !== "string") return null;
    const rowStart = new Date(row.starts_at);
    const rowEnd = new Date(row.ends_at);
    if (Number.isNaN(rowStart.getTime()) || Number.isNaN(rowEnd.getTime())) return null;
    if (
      appointmentsOverlap(next, {
        dentistId: row.dentist_id,
        startsAt: rowStart,
        endsAt: rowEnd,
        status,
      })
    ) {
      return true;
    }
  }
  return false;
}

function sameInstant(stored: string, next: Date): boolean {
  const previous = new Date(stored);
  return !Number.isNaN(previous.getTime()) && previous.getTime() === next.getTime();
}

function isExclusionConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23P01";
}

async function sendMovedAppointment(
  supabase: SupabaseClient,
  input: { clinicId: string; patientId: string; dentistId: string; startsAt: string },
): Promise<void> {
  try {
    const notice = await readMovedNotice(supabase, input);
    if (!notice) return;
    await sendMail(appointmentMovedMessage(notice));
  } catch (error) {
    const detail = error instanceof MailError ? error.code : error instanceof Error ? error.name : "unknown";
    console.error("appointment_moved mail failed:", detail);
  }
}

async function readMovedNotice(
  supabase: SupabaseClient,
  input: { clinicId: string; patientId: string; dentistId: string; startsAt: string },
): Promise<{
  to: string;
  clinicName: string;
  startsAt: string;
  dentistName: string;
  address: string;
  phone: string;
} | null> {
  const [clinic, dentist, patient, contacts] = await Promise.all([
    supabase.from("clinics").select("name, address, phone").eq("id", input.clinicId).maybeSingle(),
    supabase
      .from("clinic_members")
      .select("first_name, last_name")
      .eq("id", input.dentistId)
      .eq("clinic_id", input.clinicId)
      .maybeSingle(),
    supabase.from("patients").select("email").eq("id", input.patientId).eq("clinic_id", input.clinicId).maybeSingle(),
    supabase
      .from("patient_contacts")
      .select("email")
      .eq("clinic_id", input.clinicId)
      .eq("patient_id", input.patientId)
      .limit(1),
  ]);

  if (clinic.error || dentist.error || patient.error || contacts.error) {
    console.error("appointment_moved_mail rejected:", "unknown");
    return null;
  }

  const clinicRow = recordOf(clinic.data);
  const dentistRow = recordOf(dentist.data);
  const to = mailboxOf(recordOf(patient.data)?.email) ?? firstContactMailbox(contacts.data);
  if (!clinicRow || !dentistRow || !to) return null;

  const clinicName = textOf(clinicRow.name);
  const address = textOf(clinicRow.address);
  const phone = textOf(clinicRow.phone);
  const dentistName = `${textOf(dentistRow.first_name)} ${textOf(dentistRow.last_name)}`.replace(/\s+/g, " ").trim();
  if (!clinicName || !address || !phone || !dentistName) return null;

  return {
    to,
    clinicName,
    startsAt: input.startsAt,
    dentistName,
    address,
    phone,
  };
}

function firstContactMailbox(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const email = mailboxOf(recordOf(item)?.email);
    if (email) return email;
  }
  return null;
}

function mailboxOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email === "" ? null : email;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
