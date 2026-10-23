"use server";

import type { ZodError } from "zod";

import { loadClinicPublic } from "@/app/ordinacije/[slug]/load-clinic-public";
import { loadSelfBooking } from "@/app/ordinacije/[slug]/zakazivanje/load-self-booking";
import {
  CHECK_BOOKING,
  CHILD_BOOKS_ALONE,
  CHILD_ROUTE_TEXT,
  EMAIL_IS_ACCOUNT,
  childBookingIdentitySchema,
  childBookingLinkedSchema,
  isChildRoute,
  selfBookingIdentitySchema,
  selfBookingSlotSchema,
} from "@/app/ordinacije/[slug]/zakazivanje/schema";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requirePatient } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";

import { CLINIC_UNAVAILABLE } from "../ordinacije/[slug]/registracija/schema";

// The request row is created later. This step only accepts a valid self form.
export async function submitSelfBooking(
  _previous: ActionResult<{ ready: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ ready: true }>> {
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
  if (booking.selfLinked) {
    if (isChildRoute(booking.profile.dateOfBirth, today)) {
      return fail(CHILD_ROUTE_TEXT);
    }
    return ok({ ready: true });
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

  return ok({ ready: true });
}

// The child is a separate patient. The account email stays on the contact
// and is not written as the patient's email. The request row is created later.
export async function submitChildBooking(
  _previous: ActionResult<{ ready: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ ready: true }>> {
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

  if (child?.linked) {
    const linked = childBookingLinkedSchema.safeParse({
      ...slot.data,
      dependentId: rawId,
      guardian: entry(formData, "guardian"),
    });
    if (!linked.success) {
      return fail(CHECK_BOOKING, fieldErrorsFrom(linked.error));
    }
    return ok({ ready: true });
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

  return ok({ ready: true });
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
