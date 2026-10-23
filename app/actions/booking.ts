"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { formatDentistLabel, type PublicDentist } from "@/app/ordinacije/[slug]/dentist-preference";
import { loadClinicPublic } from "@/app/ordinacije/[slug]/load-clinic-public";
import { loadSelfBooking } from "@/app/ordinacije/[slug]/zakazivanje/load-self-booking";
import {
  BIRTH_DATE_REQUIRED,
  BOOKING_UNAVAILABLE,
  CHECK_BOOKING,
  CHILD_BOOKS_ALONE,
  CHILD_ROUTE_TEXT,
  EMAIL_IS_ACCOUNT,
  PHONE_REQUIRED,
  SLOT_TAKEN,
  TWO_PENDING,
  childBookingIdentitySchema,
  childBookingLinkedSchema,
  freeStartsHref,
  isChildRoute,
  selfBookingIdentitySchema,
  selfBookingSlotSchema,
} from "@/app/ordinacije/[slug]/zakazivanje/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requirePatient } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { MailError, requestReceivedMessage, sendMail } from "@/lib/mail";
import { normalizePhone } from "@/lib/phone";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CLINIC_UNAVAILABLE } from "../ordinacije/[slug]/registracija/schema";

const REQUEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BookingCreated = { status: "pending" };

type ReceivedNotice = {
  to: string;
  clinicName: string;
  patientName: string;
  dentistName: string;
  address: string;
  phone: string;
};

type BookingCall = {
  slug: string;
  dentistId: string;
  startsAt: string;
  forChild: boolean;
  dependentId: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  reason: string;
};

export async function submitSelfBooking(
  _previous: ActionResult<BookingCreated> | null,
  formData: FormData,
): Promise<ActionResult<BookingCreated>> {
  const slot = selfBookingSlotSchema.safeParse({
    slug: entry(formData, "slug"),
    stomatolog: entry(formData, "stomatolog"),
    pocetak: entry(formData, "pocetak"),
    reason: entry(formData, "reason") ?? "",
  });
  if (!slot.success) {
    return fail(CHECK_BOOKING, fieldErrorsFrom(slot.error));
  }

  const clinic = await loadClinicPublic(slot.data.slug);
  if (clinic.status !== "ready") {
    return fail(CLINIC_UNAVAILABLE);
  }

  const patient = await requirePatient({
    purpose: "request",
    slug: clinic.clinic.slug,
    stomatolog: slot.data.stomatolog,
    pocetak: slot.data.pocetak,
  });

  const booking = await loadSelfBooking(patient.accountId, clinic.clinic.slug);
  if (booking.status !== "ready") {
    return fail(booking.message);
  }

  const today = formatBelgradeDate(new Date());
  const call: BookingCall = {
    slug: clinic.clinic.slug,
    dentistId: slot.data.stomatolog,
    startsAt: slot.data.pocetak,
    forChild: false,
    dependentId: null,
    phone: storedPhone(booking.profile.phone),
    dateOfBirth: booking.profile.dateOfBirth,
    reason: slot.data.reason,
  };

  const notice = receivedNotice(
    patient.email,
    clinic.clinic,
    personName(booking.profile),
    slot.data.stomatolog,
  );

  if (booking.selfLinked) {
    if (isChildRoute(booking.profile.dateOfBirth, today)) {
      return fail(CHILD_ROUTE_TEXT);
    }
    return openRequest(call, notice);
  }

  const identity = selfBookingIdentitySchema.safeParse({
    ...slot.data,
    firstName: entry(formData, "firstName"),
    lastName: entry(formData, "lastName"),
    dateOfBirth: entry(formData, "dateOfBirth"),
    phone: entry(formData, "phone"),
    email: entry(formData, "email"),
    consent: entry(formData, "consent"),
  });
  if (!identity.success) {
    return fail(CHECK_BOOKING, fieldErrorsFrom(identity.error));
  }
  if (identity.data.email !== patient.email.trim().toLowerCase()) {
    return fail(CHECK_BOOKING, { email: [EMAIL_IS_ACCOUNT] });
  }
  if (isChildRoute(identity.data.dateOfBirth, today)) {
    return fail(CHILD_ROUTE_TEXT);
  }

  return openRequest(
    {
      ...call,
      phone: storedPhone(identity.data.phone),
      dateOfBirth: identity.data.dateOfBirth,
    },
    notice,
  );
}

// The child is a separate patient. The account email stays on the contact
// and is not written as the patient's email. Names are stored on the
// dependent row; create_booking reads them from there.
export async function submitChildBooking(
  _previous: ActionResult<BookingCreated> | null,
  formData: FormData,
): Promise<ActionResult<BookingCreated>> {
  const slot = selfBookingSlotSchema.safeParse({
    slug: entry(formData, "slug"),
    stomatolog: entry(formData, "stomatolog"),
    pocetak: entry(formData, "pocetak"),
    reason: entry(formData, "reason") ?? "",
  });
  if (!slot.success) {
    return fail(CHECK_BOOKING, fieldErrorsFrom(slot.error));
  }

  const clinic = await loadClinicPublic(slot.data.slug);
  if (clinic.status !== "ready") {
    return fail(CLINIC_UNAVAILABLE);
  }

  const patient = await requirePatient({
    purpose: "request",
    slug: clinic.clinic.slug,
    stomatolog: slot.data.stomatolog,
    pocetak: slot.data.pocetak,
  });

  const booking = await loadSelfBooking(patient.accountId, clinic.clinic.slug);
  if (booking.status !== "ready") {
    return fail(booking.message);
  }

  const today = formatBelgradeDate(new Date());
  const rawId = (entry(formData, "dependentId") ?? "").trim().toLowerCase();
  const child = rawId === "" ? undefined : booking.children.find((item) => item.id === rawId);
  if (rawId !== "" && !child) {
    return fail(CHECK_BOOKING);
  }
  if (child && !isChildRoute(child.dateOfBirth, today)) {
    return fail(CHILD_BOOKS_ALONE);
  }

  const call: BookingCall = {
    slug: clinic.clinic.slug,
    dentistId: slot.data.stomatolog,
    startsAt: slot.data.pocetak,
    forChild: true,
    dependentId: child?.id ?? null,
    phone: storedPhone(booking.profile.phone),
    dateOfBirth: child?.dateOfBirth ?? null,
    reason: slot.data.reason,
  };

  if (child?.linked) {
    const linked = childBookingLinkedSchema.safeParse({
      ...slot.data,
      dependentId: rawId,
      guardian: entry(formData, "guardian"),
    });
    if (!linked.success) {
      return fail(CHECK_BOOKING, fieldErrorsFrom(linked.error));
    }
    return openRequest(
      call,
      receivedNotice(patient.email, clinic.clinic, personName(child), slot.data.stomatolog),
    );
  }

  const identity = childBookingIdentitySchema.safeParse({
    ...slot.data,
    dependentId: rawId,
    childFirstName: entry(formData, "childFirstName"),
    childLastName: entry(formData, "childLastName"),
    childDateOfBirth: entry(formData, "childDateOfBirth"),
    relationship: entry(formData, "relationship"),
    contactFirstName: entry(formData, "contactFirstName"),
    contactLastName: entry(formData, "contactLastName"),
    contactPhone: entry(formData, "contactPhone"),
    contactEmail: entry(formData, "contactEmail"),
    guardian: entry(formData, "guardian"),
    consent: entry(formData, "consent"),
  });
  if (!identity.success) {
    return fail(CHECK_BOOKING, fieldErrorsFrom(identity.error));
  }
  if (identity.data.contactEmail !== patient.email.trim().toLowerCase()) {
    return fail(CHECK_BOOKING, { contactEmail: [EMAIL_IS_ACCOUNT] });
  }
  if (!isChildRoute(identity.data.childDateOfBirth, today)) {
    return fail(CHILD_BOOKS_ALONE);
  }

  const dependentId = identity.data.dependentId || (await insertChild(patient.accountId, identity.data));
  if (typeof dependentId !== "string") {
    return dependentId;
  }

  return openRequest(
    {
      ...call,
      dependentId,
      phone: storedPhone(identity.data.contactPhone),
      dateOfBirth: identity.data.childDateOfBirth,
    },
    receivedNotice(
      patient.email,
      clinic.clinic,
      personName({
        firstName: identity.data.childFirstName,
        lastName: identity.data.childLastName,
      }),
      slot.data.stomatolog,
    ),
  );
}

async function insertChild(
  accountId: string,
  child: {
    childFirstName: string;
    childLastName: string;
    childDateOfBirth: string;
    relationship: string;
  },
): Promise<ActionResult<BookingCreated> | string> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("patient_dependents")
      .insert({
        account_id: accountId,
        first_name: child.childFirstName,
        last_name: child.childLastName,
        date_of_birth: child.childDateOfBirth,
        relationship: child.relationship,
      })
      .select("id")
      .single();

    const id = readId(data);
    if (error || !id) {
      console.error("save_child rejected:", error?.code ?? "rejected");
      return fail(BOOKING_UNAVAILABLE);
    }
    return id;
  } catch (error) {
    console.error("save_child failed:", error instanceof Error ? error.name : "unknown");
    return fail(BOOKING_UNAVAILABLE);
  }
}

async function openRequest(
  input: BookingCall,
  notice: ReceivedNotice,
): Promise<ActionResult<BookingCreated>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_booking", {
      slug: input.slug,
      dentist_id: input.dentistId,
      starts_at: input.startsAt,
      for_child: input.forChild,
      dependent_id: input.dependentId,
      phone: input.phone,
      date_of_birth: input.dateOfBirth,
      contact: null,
      reason: input.reason.trim() ? input.reason.trim() : null,
    });
    if (error) {
      return bookingFailure(input.slug, error);
    }
    if (!readRequestId(data)) {
      console.error("create_booking rejected: invalid");
      return fail(BOOKING_UNAVAILABLE);
    }
    revalidatePath(freeStartsHref(input.slug));
    await sendRequestReceived(notice, input.startsAt);
    return ok({ status: "pending" });
  } catch (error) {
    console.error("create_booking failed:", error instanceof Error ? error.name : "unknown");
    return fail(BOOKING_UNAVAILABLE);
  }
}

async function sendRequestReceived(notice: ReceivedNotice, startsAt: string): Promise<void> {
  try {
    await sendMail(
      requestReceivedMessage({
        to: notice.to,
        clinicName: notice.clinicName,
        patientName: notice.patientName,
        startsAt,
        dentistName: notice.dentistName,
        address: notice.address,
        phone: notice.phone,
      }),
    );
  } catch (error) {
    const detail = error instanceof MailError ? error.code : error instanceof Error ? error.name : "unknown";
    console.error("request_received mail failed:", detail);
  }
}

function receivedNotice(
  email: string,
  clinic: { name: string; address: string; phone: string; dentists: PublicDentist[] },
  patientName: string,
  dentistId: string,
): ReceivedNotice {
  const dentist = clinic.dentists.find((item) => item.id.toLowerCase() === dentistId.toLowerCase());
  return {
    to: email.trim().toLowerCase(),
    clinicName: clinic.name,
    patientName,
    dentistName: dentist ? formatDentistLabel(dentist) : "",
    address: clinic.address,
    phone: clinic.phone,
  };
}

function personName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function bookingFailure(
  slug: string,
  error: { message?: string; code?: string },
): ActionResult<never> {
  const message = error.message ?? "";
  if (message.includes("slot is not available")) {
    revalidatePath(freeStartsHref(slug));
    return fail(SLOT_TAKEN);
  }
  if (message.includes("two pending requests")) {
    return fail(TWO_PENDING);
  }
  if (message.includes("phone is required") || message.includes("not a valid Serbian number")) {
    return fail(PHONE_REQUIRED);
  }
  if (message.includes("date of birth is required")) {
    return fail(BIRTH_DATE_REQUIRED);
  }
  console.error("create_booking rejected:", error.code ?? "rejected");
  return fail(BOOKING_UNAVAILABLE);
}

function storedPhone(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  return normalizePhone(value);
}

function readId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) {
    return null;
  }
  return readRequestId((data as { id: unknown }).id);
}

function readRequestId(data: unknown): string | null {
  return typeof data === "string" && REQUEST_ID.test(data) ? data : null;
}

function entry(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
