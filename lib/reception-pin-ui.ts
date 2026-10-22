export const PIN_IDLE_MS = 2 * 60 * 1000;

export const PIN_LOCK_ERROR = "Unesite lozinku ove osobe.";

export type ReceptionMember = {
  id: string;
  firstName: string;
  lastName: string;
};

export type ReceptionDesk = {
  clinicName: string;
  members: ReceptionMember[];
};

export type StaffHome = "/danas" | "/platforma";

/** A linked device shows names. A missing or revoked device does not. */
export function receptionScreen(
  desk: ReceptionDesk | null,
  home: StaffHome | null,
): { kind: "desk"; desk: ReceptionDesk } | { kind: "redirect"; href: StaffHome } | { kind: "login" } {
  if (desk) {
    return { kind: "desk", desk };
  }
  if (home) {
    return { kind: "redirect", href: home };
  }
  return { kind: "login" };
}

/** True once the PIN pad has had no touch for two minutes. */
export function pinEntryExpired(lastTouchAt: number, now: number, idleMs = PIN_IDLE_MS): boolean {
  return now - lastTouchAt >= idleMs;
}

/** Remaining tries after this failure. Five failures ask for the password instead. */
export function wrongPinMessage(attemptCount: number): string {
  const left = 5 - attemptCount;
  if (left <= 0) {
    return PIN_LOCK_ERROR;
  }
  if (left === 1) {
    return "Pogrešan PIN. Ostao je još 1 pokušaj.";
  }
  return `Pogrešan PIN. Ostala su još ${left} pokušaja.`;
}
