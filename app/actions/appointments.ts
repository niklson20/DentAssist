"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z, type ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireMember, type MemberSession } from "@/lib/auth";
import {
  formatBelgrade,
  formatBelgradeDate,
  hasTurned15,
  isIsoDate,
  parseBelgradeLocal,
} from "@/lib/calendar-dates";
import { APPOINTMENT_STATUSES, RELATIONSHIPS } from "@/lib/labels";
import { appointmentMovedMessage, MailError, sendMail } from "@/lib/mail";
import { normalizePhone } from "@/lib/phone";
import { allocateSlug } from "@/lib/slug";
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
const PICK_REQUEST = "Izaberite zahtev.";
const RESPOND_ONLY =
  "Samo vlasnik i stomatolog kome je termin tražen mogu da odgovore.";
const REQUEST_MISSING = "Zahtev nije pronađen.";
const REQUEST_CLOSED = "Zahtev više ne čeka potvrdu.";
const REQUEST_EXPIRED = "Rok za ovaj zahtev je istekao.";
const MESSAGE_MAX = "Poruka može imati najviše 300 znakova.";
const PICK_DECISION = "Izaberite odluku.";
const ACCEPT_DECISIONS = ["", "prihvati", "isti", "drugi"] as const;
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

const acceptSchema = z.object({
  zahtev: z.string({ error: PICK_REQUEST }).trim().uuid(PICK_REQUEST),
  odluka: z.enum(ACCEPT_DECISIONS, { error: PICK_DECISION }),
});

const rejectSchema = z.object({
  zahtev: z.string({ error: PICK_REQUEST }).trim().uuid(PICK_REQUEST),
  poruka: z.string().trim().max(300, MESSAGE_MAX),
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

type PendingRequestView = {
  id: string;
  timeLabel: string;
  name: string;
  dentistName: string;
  reason: string;
  deadlineLabel: string;
  needsChoice: boolean;
};

type AcceptDecision = "prihvati" | "isti" | "drugi";

type AcceptPayload = { id: string } | { chartChoice: true };

type BookingRequestRow = {
  id: string;
  dentistId: string;
  accountId: string;
  bookerEmail: string;
  forChild: boolean;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  contactRelationship: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactPhone: string | null;
  reason: string | null;
  patientId: string | null;
  appointmentId: string;
  expiresAt: string;
};

type ChartRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  dateOfBirth: string | null;
  mergedIntoId: string | null;
  slug: string;
};

type ContactRecord = {
  patientId: string;
  email: string | null;
  confirmedAt: string | null;
};

type ChartMatch =
  | { kind: "use"; patientId: string }
  | { kind: "choice"; patientId: string; claimEmail: boolean; addContact: boolean }
  | { kind: "create" };

export async function loadPendingRequests(): Promise<ActionResult<PendingRequestView[]>> {
  const member = await requireMember();

  try {
    const supabase = await createSupabaseServerClient();
    const actor = await clinicActor(supabase, member);
    if (!actor) return fail(SAVE_UNAVAILABLE);

    let requestQuery = supabase
      .from("booking_requests")
      .select(
        "id, dentist_id, account_id, booker_email, for_child, patient_first_name, patient_last_name, patient_date_of_birth, patient_phone, contact_relationship, contact_first_name, contact_last_name, contact_phone, reason, patient_id, appointment_id, status, expires_at",
      )
      .eq("clinic_id", member.clinicId)
      .eq("status", "pending");
    if (member.role === "dentist") {
      requestQuery = requestQuery.eq("dentist_id", actor.id);
    }

    const [requestResult, memberResult] = await Promise.all([
      requestQuery,
      supabase
        .from("clinic_members")
        .select("id, first_name, last_name")
        .eq("clinic_id", member.clinicId),
    ]);

    if (requestResult.error || memberResult.error) {
      console.error("pending_requests rejected:", "unknown");
      if (member.role === "reception") return ok([]);
      return fail(SAVE_UNAVAILABLE);
    }

    const requests = rowsOf(requestResult.data)
      .map((row) => bookingRequestFrom(row))
      .filter((row): row is BookingRequestRow => row !== null)
      .filter((row) => member.role !== "dentist" || row.dentistId === actor.id);
    if (requests.length === 0) return ok([]);

    const names = new Map<string, string>();
    for (const row of rowsOf(memberResult.data)) {
      if (typeof row.id !== "string") continue;
      const name = `${textOf(row.first_name)} ${textOf(row.last_name)}`.replace(/\s+/g, " ").trim();
      if (name) names.set(row.id, name);
    }

    const appointmentIds = requests.map((request) => request.appointmentId);
    const [appointmentResult, patientResult, contactResult] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at")
        .eq("clinic_id", member.clinicId)
        .in("id", appointmentIds),
      supabase
        .from("patients")
        .select("id, first_name, last_name, email, date_of_birth, merged_into_id, slug")
        .eq("clinic_id", member.clinicId),
      supabase
        .from("patient_contacts")
        .select("patient_id, email, confirmed_at")
        .eq("clinic_id", member.clinicId),
    ]);

    if (appointmentResult.error || patientResult.error || contactResult.error) {
      console.error("pending_requests_match rejected:", "unknown");
      return fail(SAVE_UNAVAILABLE);
    }

    const starts = new Map<string, string>();
    for (const row of rowsOf(appointmentResult.data)) {
      if (typeof row.id === "string" && typeof row.starts_at === "string") {
        starts.set(row.id, row.starts_at);
      }
    }
    const charts = chartRows(patientResult.data);
    const contacts = contactRows(contactResult.data);

    const views = requests
      .slice()
      .sort((left, right) =>
        (starts.get(left.appointmentId) ?? "").localeCompare(starts.get(right.appointmentId) ?? ""),
      )
      .map((request) =>
        pendingView(
          request,
          names.get(request.dentistId) ?? "—",
          starts.get(request.appointmentId) ?? null,
          charts,
          contacts,
        ),
      );

    return ok(views);
  } catch (error) {
    console.error("pending_requests failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function acceptRequest(
  _previous: ActionResult<AcceptPayload> | null,
  formData: FormData,
): Promise<ActionResult<AcceptPayload>> {
  const parsed = acceptSchema.safeParse({
    zahtev: text(formData.get("zahtev")),
    odluka: text(formData.get("odluka")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }
  const decision: AcceptDecision = parsed.data.odluka === "" ? "prihvati" : parsed.data.odluka;

  const member = await requireMember();
  if (member.role === "reception") return fail(RESPOND_ONLY);

  try {
    const supabase = await createSupabaseServerClient();
    const actor = await clinicActor(supabase, member);
    if (!actor) return fail(SAVE_UNAVAILABLE);

    const request = await readPendingRequest(supabase, member.clinicId, parsed.data.zahtev);
    if (request === "missing") return fail(REQUEST_MISSING);
    if (request === "closed") return fail(REQUEST_CLOSED);
    if (request === "unavailable") return fail(SAVE_UNAVAILABLE);
    if (!mayRespond(member, actor.id, request.dentistId)) return fail(RESPOND_ONLY);
    if (isExpired(request.expiresAt)) return fail(REQUEST_EXPIRED);

    const hold = await readHeldAppointment(supabase, member.clinicId, request.appointmentId);
    if (hold === "missing") return fail(REQUEST_MISSING);
    if (hold === "closed") return fail(REQUEST_CLOSED);
    if (hold === "unavailable") return fail(SAVE_UNAVAILABLE);

    const charts = await readCharts(supabase, member.clinicId);
    if (!charts) return fail(SAVE_UNAVAILABLE);
    const contacts = request.forChild ? await readContacts(supabase, member.clinicId) : [];
    if (!contacts) return fail(SAVE_UNAVAILABLE);

    const match = matchChart(request, charts, contacts);
    if (match.kind === "choice" && decision === "prihvati") {
      return ok({ chartChoice: true });
    }

    const placed = await placeAcceptedChart(supabase, member.clinicId, request, charts, match, decision);
    if ("error" in placed) return placed.error;
    if ("chartChoice" in placed) return ok({ chartChoice: true });

    const linked = await ensureChartLink(supabase, member.clinicId, request, placed.patientId);
    if (!linked) return fail(SAVE_UNAVAILABLE);

    if (placed.claimEmail) {
      const claimed = await insertEmailClaim(supabase, member.clinicId, placed.patientId, request);
      if (!claimed) return fail(SAVE_UNAVAILABLE);
    }

    const scheduled = await supabase
      .from("appointments")
      .update({
        status: "scheduled",
        patient_id: placed.patientId,
        confirmed_at: new Date().toISOString(),
        confirmed_by: actor.id,
      })
      .eq("id", request.appointmentId)
      .eq("clinic_id", member.clinicId)
      .eq("status", "pending_confirmation")
      .select("id")
      .maybeSingle();
    const scheduledId = scheduled.data && typeof scheduled.data.id === "string" ? scheduled.data.id : null;
    if (scheduled.error || !scheduledId) {
      console.error("accept_request_appointment rejected:", scheduled.error ? "unknown" : "empty");
      return fail(SAVE_UNAVAILABLE);
    }

    const accepted = await supabase
      .from("booking_requests")
      .update({ status: "accepted", patient_id: placed.patientId })
      .eq("id", request.id)
      .eq("clinic_id", member.clinicId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (accepted.error || !accepted.data) {
      console.error("accept_request rejected:", accepted.error ? "unknown" : "empty");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath("/danas");
    revalidatePath("/pacijenti");
    return ok({ id: scheduledId });
  } catch (error) {
    console.error("accept_request failed:", error instanceof Error ? error.name : "unknown");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function rejectRequest(
  _previous: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = rejectSchema.safeParse({
    zahtev: text(formData.get("zahtev")),
    poruka: text(formData.get("poruka")),
  });
  if (!parsed.success) {
    return fail(CHECK, fieldErrorsFrom(parsed.error));
  }

  const member = await requireMember();
  if (member.role === "reception") return fail(RESPOND_ONLY);

  try {
    const supabase = await createSupabaseServerClient();
    const actor = await clinicActor(supabase, member);
    if (!actor) return fail(SAVE_UNAVAILABLE);

    const request = await readPendingRequest(supabase, member.clinicId, parsed.data.zahtev);
    if (request === "missing") return fail(REQUEST_MISSING);
    if (request === "closed") return fail(REQUEST_CLOSED);
    if (request === "unavailable") return fail(SAVE_UNAVAILABLE);
    if (!mayRespond(member, actor.id, request.dentistId)) return fail(RESPOND_ONLY);

    const cancelled = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_by: "staff",
        cancellation_note: null,
      })
      .eq("id", request.appointmentId)
      .eq("clinic_id", member.clinicId)
      .eq("status", "pending_confirmation")
      .select("id")
      .maybeSingle();
    const cancelledId = cancelled.data && typeof cancelled.data.id === "string" ? cancelled.data.id : null;
    if (cancelled.error || !cancelledId) {
      console.error("reject_request_appointment rejected:", cancelled.error ? "unknown" : "empty");
      return fail(SAVE_UNAVAILABLE);
    }

    const rejected = await supabase
      .from("booking_requests")
      .update({
        status: "rejected",
        patient_note: parsed.data.poruka === "" ? null : parsed.data.poruka,
      })
      .eq("id", request.id)
      .eq("clinic_id", member.clinicId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (rejected.error || !rejected.data) {
      console.error("reject_request rejected:", rejected.error ? "unknown" : "empty");
      return fail(SAVE_UNAVAILABLE);
    }

    revalidatePath("/danas");
    return ok({ id: cancelledId });
  } catch (error) {
    console.error("reject_request failed:", error instanceof Error ? error.name : "unknown");
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

type PlacedChart =
  | { patientId: string; claimEmail: boolean }
  | { chartChoice: true }
  | { error: ActionResult<never> };

async function clinicActor(
  supabase: SupabaseClient,
  member: MemberSession,
): Promise<{ id: string } | null> {
  const loaded = await supabase
    .from("clinic_members")
    .select("id")
    .eq("clinic_id", member.clinicId)
    .eq("user_id", member.userId)
    .maybeSingle();
  if (loaded.error) {
    console.error("booking_response_member rejected:", "unknown");
    return null;
  }
  const id = loaded.data && typeof loaded.data.id === "string" ? loaded.data.id : null;
  return id ? { id } : null;
}

function mayRespond(member: MemberSession, actorId: string, dentistId: string): boolean {
  if (member.role === "owner") return true;
  return member.role === "dentist" && actorId === dentistId;
}

function isExpired(iso: string): boolean {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) || time <= Date.now();
}

async function readPendingRequest(
  supabase: SupabaseClient,
  clinicId: string,
  requestId: string,
): Promise<BookingRequestRow | "missing" | "closed" | "unavailable"> {
  const loaded = await supabase
    .from("booking_requests")
    .select(
      "id, dentist_id, account_id, booker_email, for_child, patient_first_name, patient_last_name, patient_date_of_birth, patient_phone, contact_relationship, contact_first_name, contact_last_name, contact_phone, reason, patient_id, appointment_id, status, expires_at",
    )
    .eq("id", requestId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (loaded.error) {
    console.error("booking_request_read rejected:", "unknown");
    return "unavailable";
  }
  const row = recordOf(loaded.data);
  if (!row) return "missing";
  if (row.status !== "pending") return "closed";
  const request = bookingRequestFrom(row);
  return request ?? "unavailable";
}

async function readHeldAppointment(
  supabase: SupabaseClient,
  clinicId: string,
  appointmentId: string,
): Promise<"ok" | "missing" | "closed" | "unavailable"> {
  const loaded = await supabase
    .from("appointments")
    .select("id, status")
    .eq("id", appointmentId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (loaded.error) {
    console.error("booking_request_appointment rejected:", "unknown");
    return "unavailable";
  }
  const row = recordOf(loaded.data);
  if (!row) return "missing";
  if (row.status !== "pending_confirmation") return "closed";
  return "ok";
}

async function readCharts(supabase: SupabaseClient, clinicId: string): Promise<ChartRecord[] | null> {
  const listed = await supabase
    .from("patients")
    .select("id, first_name, last_name, email, date_of_birth, merged_into_id, slug")
    .eq("clinic_id", clinicId);
  if (listed.error) {
    console.error("accept_request_charts rejected:", "unknown");
    return null;
  }
  return chartRows(listed.data);
}

async function readContacts(supabase: SupabaseClient, clinicId: string): Promise<ContactRecord[] | null> {
  const listed = await supabase
    .from("patient_contacts")
    .select("patient_id, email, confirmed_at")
    .eq("clinic_id", clinicId);
  if (listed.error) {
    console.error("accept_request_contacts rejected:", "unknown");
    return null;
  }
  return contactRows(listed.data);
}

async function placeAcceptedChart(
  supabase: SupabaseClient,
  clinicId: string,
  request: BookingRequestRow,
  charts: ChartRecord[],
  match: ChartMatch,
  decision: AcceptDecision,
): Promise<PlacedChart> {
  if (match.kind === "choice" && decision === "prihvati") return { chartChoice: true };

  if (match.kind === "use" || (match.kind === "choice" && decision === "isti")) {
    const claimEmail = match.kind === "choice" && match.claimEmail;
    if (match.kind === "choice" && match.addContact) {
      const added = await insertContact(supabase, clinicId, match.patientId, request);
      if (!added) return { error: fail(SAVE_UNAVAILABLE) };
    }
    return { patientId: match.patientId, claimEmail };
  }

  if (decision === "isti") return { error: fail(CHECK, { odluka: [PICK_DECISION] }) };

  const patientId = await createChart(supabase, clinicId, request, charts);
  if (!patientId) return { error: fail(SAVE_UNAVAILABLE) };
  return { patientId, claimEmail: false };
}

async function createChart(
  supabase: SupabaseClient,
  clinicId: string,
  request: BookingRequestRow,
  charts: ChartRecord[],
): Promise<string | null> {
  const contact = request.forChild ? childContact(request) : null;
  if (request.forChild && !contact) return null;

  const email = request.forChild || emailUsed(charts, request.bookerEmail) ? null : request.bookerEmail;
  const slug = allocateSlug(
    `${request.firstName} ${request.lastName}`,
    "patient",
    charts.map((chart) => chart.slug).filter((value) => value !== ""),
  );
  const created = await supabase
    .from("patients")
    .insert({
      clinic_id: clinicId,
      first_name: request.firstName,
      last_name: request.lastName,
      slug,
      email,
      phone: request.forChild ? null : request.phone,
      date_of_birth: request.dateOfBirth,
    })
    .select("id")
    .single();
  const patientId = created.data && typeof created.data.id === "string" ? created.data.id : null;
  if (created.error || !patientId) {
    console.error("accept_request_chart rejected:", created.error ? "unknown" : "empty");
    return null;
  }

  if (contact) {
    const added = await insertContact(supabase, clinicId, patientId, request);
    if (!added) return null;
  }
  return patientId;
}

async function insertContact(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  request: BookingRequestRow,
): Promise<boolean> {
  const contact = childContact(request);
  if (!contact) return false;
  const inserted = await supabase
    .from("patient_contacts")
    .insert({
      patient_id: patientId,
      clinic_id: clinicId,
      relationship: contact.relationship,
      first_name: contact.firstName,
      last_name: contact.lastName,
      phone: contact.phone,
      email: request.bookerEmail,
      confirmed_at: null,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    console.error("accept_request_contact rejected:", inserted.error ? "unknown" : "empty");
    return false;
  }
  return true;
}

async function ensureChartLink(
  supabase: SupabaseClient,
  clinicId: string,
  request: BookingRequestRow,
  patientId: string,
): Promise<boolean> {
  const dependentId = await dependentFor(supabase, request);
  const existing = await supabase
    .from("patient_chart_links")
    .select("account_id, dependent_id")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .maybeSingle();
  if (existing.error) {
    console.error("accept_request_link_read rejected:", "unknown");
    return false;
  }

  const row = recordOf(existing.data);
  if (row) {
    const accountId = typeof row.account_id === "string" ? row.account_id : null;
    const linkedDependent = typeof row.dependent_id === "string" ? row.dependent_id : null;
    return accountId === request.accountId && linkedDependent === dependentId;
  }

  const inserted = await supabase
    .from("patient_chart_links")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      account_id: request.accountId,
      dependent_id: dependentId,
      confirmed_at: null,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    console.error("accept_request_link rejected:", inserted.error ? "unknown" : "empty");
    return false;
  }
  return true;
}

async function dependentFor(supabase: SupabaseClient, request: BookingRequestRow): Promise<string | null> {
  if (!request.forChild) return null;
  const listed = await supabase
    .from("patient_dependents")
    .select("id, first_name, last_name, date_of_birth, relationship")
    .eq("account_id", request.accountId);
  if (listed.error) {
    console.error("accept_request_dependent rejected:", "unknown");
    return null;
  }
  for (const row of rowsOf(listed.data)) {
    if (typeof row.id !== "string") continue;
    const relationship = textOf(row.relationship);
    if (
      sameName(textOf(row.first_name), request.firstName) &&
      sameName(textOf(row.last_name), request.lastName) &&
      dateKey(row.date_of_birth) === request.dateOfBirth &&
      (relationship === "" || relationship === request.contactRelationship)
    ) {
      return row.id;
    }
  }
  return null;
}

async function insertEmailClaim(
  supabase: SupabaseClient,
  clinicId: string,
  patientId: string,
  request: BookingRequestRow,
): Promise<boolean> {
  const inserted = await supabase
    .from("patient_email_claims")
    .insert({
      patient_id: patientId,
      clinic_id: clinicId,
      appointment_id: request.appointmentId,
      email: request.bookerEmail,
      status: "pending",
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    console.error("accept_request_email_claim rejected:", inserted.error ? "unknown" : "empty");
    return false;
  }
  return true;
}

function pendingView(
  request: BookingRequestRow,
  dentistName: string,
  startsAt: string | null,
  charts: ChartRecord[],
  contacts: ContactRecord[],
): PendingRequestView {
  const start = startsAt ? new Date(startsAt) : null;
  const deadline = new Date(request.expiresAt);
  const timeLabel =
    start && !Number.isNaN(start.getTime())
      ? formatBelgrade(start, { hour: "2-digit", minute: "2-digit" })
      : "—";
  const deadlineLabel = Number.isNaN(deadline.getTime())
    ? "—"
    : formatBelgrade(deadline, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
  return {
    id: request.id,
    timeLabel,
    name: `${request.firstName} ${request.lastName}`.replace(/\s+/g, " ").trim(),
    dentistName,
    reason: request.reason ?? "Nije unet",
    deadlineLabel,
    needsChoice: matchChart(request, charts, contacts).kind === "choice",
  };
}

function bookingRequestFrom(row: Record<string, unknown>): BookingRequestRow | null {
  if (
    typeof row.id !== "string" ||
    typeof row.dentist_id !== "string" ||
    typeof row.account_id !== "string" ||
    typeof row.for_child !== "boolean" ||
    typeof row.appointment_id !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    return null;
  }
  const email = mailboxOf(row.booker_email);
  const firstName = textOf(row.patient_first_name);
  const lastName = textOf(row.patient_last_name);
  const dateOfBirth = dateKey(row.patient_date_of_birth);
  if (!email || !firstName || !lastName || !dateOfBirth) return null;
  const phone = textOf(row.patient_phone);
  return {
    id: row.id,
    dentistId: row.dentist_id,
    accountId: row.account_id,
    bookerEmail: email,
    forChild: row.for_child,
    firstName,
    lastName,
    dateOfBirth,
    phone: phone === "" ? null : phone,
    contactRelationship: textOf(row.contact_relationship) || null,
    contactFirstName: textOf(row.contact_first_name) || null,
    contactLastName: textOf(row.contact_last_name) || null,
    contactPhone: textOf(row.contact_phone) || null,
    reason: textOf(row.reason) || null,
    patientId: typeof row.patient_id === "string" ? row.patient_id : null,
    appointmentId: row.appointment_id,
    expiresAt: row.expires_at,
  };
}

function matchChart(request: BookingRequestRow, charts: ChartRecord[], contacts: ContactRecord[]): ChartMatch {
  if (request.patientId) return { kind: "use", patientId: request.patientId };

  const open = charts.filter((chart) => chart.mergedIntoId === null);
  if (!request.forChild) {
    const exact = open.find(
      (chart) =>
        chart.email === request.bookerEmail &&
        sameName(chart.firstName, request.firstName) &&
        sameName(chart.lastName, request.lastName) &&
        chart.dateOfBirth === request.dateOfBirth,
    );
    if (exact) return { kind: "use", patientId: exact.id };

    const sameEmpty = open.find(
      (chart) =>
        chart.email === null &&
        sameName(chart.firstName, request.firstName) &&
        sameName(chart.lastName, request.lastName) &&
        chart.dateOfBirth === request.dateOfBirth,
    );
    if (sameEmpty) {
      return { kind: "choice", patientId: sameEmpty.id, claimEmail: true, addContact: false };
    }

    // The chart that already holds this email may belong to someone else.
    // Its name stays here and is not returned to the patient.
    const emailOwner = open.find((chart) => chart.email === request.bookerEmail);
    if (emailOwner) {
      return { kind: "choice", patientId: emailOwner.id, claimEmail: false, addContact: false };
    }

    const sameNameOnly = open.find(
      (chart) =>
        sameName(chart.firstName, request.firstName) &&
        sameName(chart.lastName, request.lastName) &&
        chart.dateOfBirth !== request.dateOfBirth,
    );
    if (sameNameOnly) {
      return {
        kind: "choice",
        patientId: sameNameOnly.id,
        claimEmail: sameNameOnly.email === null,
        addContact: false,
      };
    }
    return { kind: "create" };
  }

  const sameChild = open.filter(
    (chart) =>
      sameName(chart.firstName, request.firstName) &&
      sameName(chart.lastName, request.lastName) &&
      chart.dateOfBirth === request.dateOfBirth,
  );
  const confirmed = sameChild.find((chart) =>
    contacts.some(
      (contact) =>
        contact.patientId === chart.id &&
        contact.email === request.bookerEmail &&
        contact.confirmedAt !== null,
    ),
  );
  if (confirmed) return { kind: "use", patientId: confirmed.id };

  const existing = sameChild[0];
  if (!existing) return { kind: "create" };
  const alreadyContact = contacts.some(
    (contact) => contact.patientId === existing.id && contact.email === request.bookerEmail,
  );
  return { kind: "choice", patientId: existing.id, claimEmail: false, addContact: !alreadyContact };
}

function chartRows(value: unknown): ChartRecord[] {
  const charts: ChartRecord[] = [];
  for (const row of rowsOf(value)) {
    if (typeof row.id !== "string") continue;
    charts.push({
      id: row.id,
      firstName: textOf(row.first_name),
      lastName: textOf(row.last_name),
      email: mailboxOf(row.email),
      dateOfBirth: dateKey(row.date_of_birth),
      mergedIntoId: typeof row.merged_into_id === "string" ? row.merged_into_id : null,
      slug: textOf(row.slug),
    });
  }
  return charts;
}

function contactRows(value: unknown): ContactRecord[] {
  const contacts: ContactRecord[] = [];
  for (const row of rowsOf(value)) {
    if (typeof row.patient_id !== "string") continue;
    contacts.push({
      patientId: row.patient_id,
      email: mailboxOf(row.email),
      confirmedAt: typeof row.confirmed_at === "string" && row.confirmed_at !== "" ? row.confirmed_at : null,
    });
  }
  return contacts;
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    const row = recordOf(item);
    if (row) rows.push(row);
  }
  return rows;
}

function childContact(request: BookingRequestRow): {
  relationship: (typeof RELATIONSHIPS)[number];
  firstName: string;
  lastName: string;
  phone: string;
} | null {
  const relationship = RELATIONSHIPS.find((item) => item === request.contactRelationship);
  if (!relationship || !request.contactFirstName || !request.contactLastName || !request.contactPhone) return null;
  return {
    relationship,
    firstName: request.contactFirstName,
    lastName: request.contactLastName,
    phone: request.contactPhone,
  };
}

function emailUsed(charts: ChartRecord[], email: string): boolean {
  return charts.some((chart) => chart.mergedIntoId === null && chart.email === email);
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("sr-Latn") === right.trim().toLocaleLowerCase("sr-Latn");
}

function dateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}
