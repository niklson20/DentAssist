import { describe, expect, it } from "vitest";
import {
  ACCESS_REQUEST_STATUSES,
  ALERT_CODES,
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  BOOKING_LINK_PURPOSES,
  BOOKING_REQUEST_STATUSES,
  CALENDAR_APPOINTMENT_STATUSES,
  CANCELLED_BY,
  CLINIC_STATUSES,
  EMAIL_CLAIM_STATUSES,
  EMAIL_DECLINED_LABEL,
  FILE_CATEGORIES,
  MEMBER_ROLES,
  OCCUPYING_APPOINTMENT_STATUSES,
  PATIENT_EMAIL_TASK_LABEL,
  RELATIONSHIPS,
  REMINDER_KINDS,
  SEXES,
  TOOTH_STATUSES,
  TOOTH_SURFACES,
  accessRequestStatusLabels,
  alertCodeLabels,
  appointmentSourceLabels,
  appointmentStatusLabel,
  appointmentStatusLabels,
  bookingLinkPurposeLabels,
  bookingRequestStatusLabels,
  cancelledByLabels,
  clinicStatusLabels,
  emailClaimStatusLabels,
  fileCategoryLabels,
  memberRoleLabels,
  occupiesAppointmentSlot,
  relationshipLabels,
  reminderKindLabels,
  sexLabels,
  showsOnCalendar,
  toothStatusAllowsSurfaces,
  toothStatusLabels,
  toothSurfaceLabels,
} from "@/lib/labels";

const GROUPS = [
  clinicStatusLabels,
  memberRoleLabels,
  accessRequestStatusLabels,
  emailClaimStatusLabels,
  alertCodeLabels,
  toothStatusLabels,
  toothSurfaceLabels,
  fileCategoryLabels,
  bookingRequestStatusLabels,
  appointmentStatusLabels,
  appointmentSourceLabels,
  cancelledByLabels,
  bookingLinkPurposeLabels,
  reminderKindLabels,
  sexLabels,
  relationshipLabels,
];

describe("labels", () => {
  it("gives every stored code a Serbian label", () => {
    for (const labels of GROUPS) {
      for (const [code, label] of Object.entries(labels)) {
        expect(label.trim().length).toBeGreaterThan(0);
        expect(label).not.toBe(code);
      }
    }
    expect(CLINIC_STATUSES).toHaveLength(Object.keys(clinicStatusLabels).length);
    expect(MEMBER_ROLES).toHaveLength(Object.keys(memberRoleLabels).length);
    expect(ACCESS_REQUEST_STATUSES).toHaveLength(Object.keys(accessRequestStatusLabels).length);
    expect(APPOINTMENT_SOURCES).toHaveLength(Object.keys(appointmentSourceLabels).length);
    expect(BOOKING_LINK_PURPOSES).toHaveLength(Object.keys(bookingLinkPurposeLabels).length);
    expect(SEXES).toHaveLength(Object.keys(sexLabels).length);
    expect(RELATIONSHIPS).toHaveLength(Object.keys(relationshipLabels).length);
    expect(EMAIL_CLAIM_STATUSES).toHaveLength(Object.keys(emailClaimStatusLabels).length);
    expect(ALERT_CODES).toHaveLength(Object.keys(alertCodeLabels).length);
    expect(TOOTH_STATUSES).toHaveLength(Object.keys(toothStatusLabels).length);
    expect(TOOTH_SURFACES).toHaveLength(Object.keys(toothSurfaceLabels).length);
    expect(FILE_CATEGORIES).toHaveLength(Object.keys(fileCategoryLabels).length);
    expect(BOOKING_REQUEST_STATUSES).toHaveLength(Object.keys(bookingRequestStatusLabels).length);
    expect(APPOINTMENT_STATUSES).toHaveLength(Object.keys(appointmentStatusLabels).length);
    expect(CANCELLED_BY).toHaveLength(Object.keys(cancelledByLabels).length);
    expect(REMINDER_KINDS).toHaveLength(Object.keys(reminderKindLabels).length);
  });

  it("names appointment statuses the way the calendar does", () => {
    expect(appointmentStatusLabel("pending_confirmation")).toBe("Čeka potvrdu");
    expect(appointmentStatusLabel("offered")).toBe("Ponuđen");
    expect(appointmentStatusLabel("scheduled")).toBe("Zakazan");
    expect(appointmentStatusLabel("completed")).toBe("Završen");
    expect(appointmentStatusLabel("no_show")).toBe("Nije došao");
    expect(appointmentStatusLabel("cancelled")).toBe("Otkazan");
  });

  it("holds the slot for every status except cancelled", () => {
    expect(OCCUPYING_APPOINTMENT_STATUSES).toEqual([
      "pending_confirmation",
      "offered",
      "scheduled",
      "completed",
      "no_show",
    ]);
    for (const status of APPOINTMENT_STATUSES) {
      expect(occupiesAppointmentSlot(status)).toBe(status !== "cancelled");
    }
  });

  it("keeps request holds and cancelled off the staff calendar", () => {
    expect(CALENDAR_APPOINTMENT_STATUSES).toEqual(["scheduled", "completed", "no_show"]);
    for (const status of APPOINTMENT_STATUSES) {
      expect(showsOnCalendar(status)).toBe(
        status !== "pending_confirmation" && status !== "offered" && status !== "cancelled",
      );
    }
  });

  it("names teeth, surfaces, files, alerts, and relationships from the chart", () => {
    expect(toothStatusLabels.caries).toBe("Karijes");
    expect(toothStatusLabels.filling).toBe("Plomba");
    expect(toothStatusLabels.root_canal).toBe("Lečen kanal");
    expect(toothSurfaceLabels.occlusal).toBe("Grizna ili sečna");
    expect(toothStatusAllowsSurfaces("caries")).toBe(true);
    expect(toothStatusAllowsSurfaces("filling")).toBe(true);
    expect(toothStatusAllowsSurfaces("crown")).toBe(false);
    expect(fileCategoryLabels.xray).toBe("RTG");
    expect(alertCodeLabels.drug_allergy).toBe("Alergija na lek");
    expect(relationshipLabels.guardian).toBe("Staratelj");
    expect(sexLabels.male).toBe("Muški");
    expect(PATIENT_EMAIL_TASK_LABEL).toBe("Unesite mejl pacijenta");
    expect(EMAIL_DECLINED_LABEL).toBe("Nema mejl");
    expect(bookingRequestStatusLabels.declined_by_patient).toBe("Nijedan ne odgovara");
  });
});
