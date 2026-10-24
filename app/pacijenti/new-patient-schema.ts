const JMBG = /^[0-9]{13}$/;

export const JMBG_INVALID = "JMBG ima 13 cifara.";

export function parsePatientJmbg(value: string): { ok: true; jmbg: string | null } | { ok: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, jmbg: null };
  }
  if (!JMBG.test(trimmed)) {
    return { ok: false, message: JMBG_INVALID };
  }
  return { ok: true, jmbg: trimmed };
}
