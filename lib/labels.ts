export const CLINIC_STATUSES = ["active", "disabled"] as const;
export type ClinicStatus = (typeof CLINIC_STATUSES)[number];

export const clinicStatusLabels: Record<ClinicStatus, string> = {
  active: "Aktivna",
  disabled: "Ugašena",
};

export const MEMBER_ROLES = ["owner", "dentist", "reception"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const memberRoleLabels: Record<MemberRole, string> = {
  owner: "Vlasnik",
  dentist: "Stomatolog",
  reception: "Recepcija",
};

export const ACCESS_REQUEST_STATUSES = ["pending", "invited", "dismissed"] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const accessRequestStatusLabels: Record<AccessRequestStatus, string> = {
  pending: "Čeka",
  invited: "Pozvan",
  dismissed: "Odbačen",
};

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

export const sexLabels: Record<Sex, string> = {
  male: "Muški",
  female: "Ženski",
};

export const RELATIONSHIPS = [
  "mother",
  "father",
  "guardian",
  "grandmother",
  "grandfather",
  "other_relative",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const relationshipLabels: Record<Relationship, string> = {
  mother: "Majka",
  father: "Otac",
  guardian: "Staratelj",
  grandmother: "Baba",
  grandfather: "Deda",
  other_relative: "Drugi srodnik",
};

export const EMAIL_CLAIM_STATUSES = ["pending", "confirmed", "rejected"] as const;
export type EmailClaimStatus = (typeof EMAIL_CLAIM_STATUSES)[number];

export const emailClaimStatusLabels: Record<EmailClaimStatus, string> = {
  pending: "Čeka potvrdu",
  confirmed: "Potvrđen",
  rejected: "Odbijen",
};

export const ALERT_CODES = ["drug_allergy", "pregnancy", "coagulation", "other"] as const;
export type AlertCode = (typeof ALERT_CODES)[number];

export const alertCodeLabels: Record<AlertCode, string> = {
  drug_allergy: "Alergija na lek",
  pregnancy: "Trudnoća",
  coagulation: "Zgrušavanje",
  other: "Ostalo",
};

export const TOOTH_STATUSES = [
  "healthy",
  "unerupted",
  "caries",
  "filling",
  "crown",
  "root_canal",
  "missing",
  "implant",
  "to_extract",
  "fracture",
] as const;
export type ToothStatus = (typeof TOOTH_STATUSES)[number];

export const toothStatusLabels: Record<ToothStatus, string> = {
  healthy: "Zdrav",
  unerupted: "Nije iznikao",
  caries: "Karijes",
  filling: "Plomba",
  crown: "Krunica",
  root_canal: "Lečen kanal",
  missing: "Nedostaje",
  implant: "Implantat",
  to_extract: "Za vađenje",
  fracture: "Prelom",
};

export const TOOTH_SURFACES = ["occlusal", "lingual", "vestibular", "mesial", "distal"] as const;
export type ToothSurface = (typeof TOOTH_SURFACES)[number];

export const toothSurfaceLabels: Record<ToothSurface, string> = {
  occlusal: "Grizna ili sečna",
  lingual: "Unutrašnja",
  vestibular: "Spoljna",
  mesial: "Mezijalna",
  distal: "Distalna",
};

export const FILE_CATEGORIES = ["xray", "photo", "report", "other"] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

export const fileCategoryLabels: Record<FileCategory, string> = {
  xray: "RTG",
  photo: "Fotografija",
  report: "Nalaz/PDF",
  other: "Ostalo",
};

export const BOOKING_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "expired",
  "declined_by_patient",
] as const;
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number];

export const bookingRequestStatusLabels: Record<BookingRequestStatus, string> = {
  pending: "Čeka potvrdu",
  accepted: "Prihvaćen",
  rejected: "Odbijen",
  expired: "Istekao",
  declined_by_patient: "Nijedan ne odgovara",
};

export const APPOINTMENT_STATUSES = [
  "pending_confirmation",
  "offered",
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending_confirmation: "Čeka potvrdu",
  offered: "Ponuđen",
  scheduled: "Zakazan",
  completed: "Završen",
  no_show: "Nije došao",
  cancelled: "Otkazan",
};

export const OCCUPYING_APPOINTMENT_STATUSES = [
  "pending_confirmation",
  "offered",
  "scheduled",
  "completed",
  "no_show",
] as const satisfies readonly AppointmentStatus[];

/** Booked visits on the staff calendar. Request holds stay off the grid. */
export const CALENDAR_APPOINTMENT_STATUSES = [
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const satisfies readonly AppointmentStatus[];

export const APPOINTMENT_SOURCES = ["patient", "staff"] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

export const appointmentSourceLabels: Record<AppointmentSource, string> = {
  patient: "Pacijent",
  staff: "Osoblje",
};

export const CANCELLED_BY = ["patient", "staff", "system"] as const;
export type CancelledBy = (typeof CANCELLED_BY)[number];

export const cancelledByLabels: Record<CancelledBy, string> = {
  patient: "Pacijent",
  staff: "Osoblje",
  system: "Sistem",
};

export const BOOKING_LINK_PURPOSES = ["offer", "manage"] as const;
export type BookingLinkPurpose = (typeof BOOKING_LINK_PURPOSES)[number];

export const bookingLinkPurposeLabels: Record<BookingLinkPurpose, string> = {
  offer: "Ponuda",
  manage: "Pomeranje i otkaz",
};

export const REMINDER_KINDS = ["24h", "2h"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const reminderKindLabels: Record<ReminderKind, string> = {
  "24h": "24 sata pre",
  "2h": "2 sata pre",
};

export const PATIENT_EMAIL_TASK_LABEL = "Unesite mejl pacijenta";

export const EMAIL_DECLINED_LABEL = "Nema mejl";

export function clinicStatusLabel(status: ClinicStatus): string {
  return clinicStatusLabels[status];
}

export function memberRoleLabel(role: MemberRole): string {
  return memberRoleLabels[role];
}

export function accessRequestStatusLabel(status: AccessRequestStatus): string {
  return accessRequestStatusLabels[status];
}

export function sexLabel(sex: Sex): string {
  return sexLabels[sex];
}

export function relationshipLabel(relationship: Relationship): string {
  return relationshipLabels[relationship];
}

export function emailClaimStatusLabel(status: EmailClaimStatus): string {
  return emailClaimStatusLabels[status];
}

export function alertCodeLabel(code: AlertCode): string {
  return alertCodeLabels[code];
}

export function toothStatusLabel(status: ToothStatus): string {
  return toothStatusLabels[status];
}

export function toothSurfaceLabel(surface: ToothSurface): string {
  return toothSurfaceLabels[surface];
}

export function toothStatusAllowsSurfaces(status: ToothStatus): boolean {
  return status === "caries" || status === "filling";
}

export function fileCategoryLabel(category: FileCategory): string {
  return fileCategoryLabels[category];
}

export function bookingRequestStatusLabel(status: BookingRequestStatus): string {
  return bookingRequestStatusLabels[status];
}

export function appointmentStatusLabel(status: AppointmentStatus): string {
  return appointmentStatusLabels[status];
}

export function occupiesAppointmentSlot(status: AppointmentStatus): boolean {
  return (OCCUPYING_APPOINTMENT_STATUSES as readonly AppointmentStatus[]).includes(status);
}

export function showsOnCalendar(status: AppointmentStatus): boolean {
  return (CALENDAR_APPOINTMENT_STATUSES as readonly AppointmentStatus[]).includes(status);
}

export function appointmentSourceLabel(source: AppointmentSource): string {
  return appointmentSourceLabels[source];
}

export function cancelledByLabel(cancelledBy: CancelledBy): string {
  return cancelledByLabels[cancelledBy];
}

export function bookingLinkPurposeLabel(purpose: BookingLinkPurpose): string {
  return bookingLinkPurposeLabels[purpose];
}

export function reminderKindLabel(kind: ReminderKind): string {
  return reminderKindLabels[kind];
}
