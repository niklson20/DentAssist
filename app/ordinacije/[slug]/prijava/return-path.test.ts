import { describe, expect, it } from "vitest";

import { patientAuthPath, patientReturnPath, readPatientReturnQuery } from "@/lib/auth";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";

describe("patient return path", () => {
  it("returns to the same clinic when the saved start is missing", () => {
    expect(patientReturnPath("Centar")).toBe("/ordinacije/centar");
    expect(patientReturnPath("centar", { stomatolog: dentistId })).toBe("/ordinacije/centar");
    expect(readPatientReturnQuery(dentistId, "javascript:alert(1)")).toEqual({});
  });

  it("keeps a dentist id and a slot start", () => {
    const params = new URLSearchParams({ stomatolog: dentistId, pocetak: startsAt });
    expect(patientReturnPath("centar", { stomatolog: dentistId, pocetak: startsAt })).toBe(
      `/ordinacije/centar/zakazivanje?${params.toString()}`,
    );
    expect(patientAuthPath("centar", "prijava", { stomatolog: dentistId, pocetak: startsAt })).toBe(
      `/ordinacije/centar/prijava?${params.toString()}`,
    );
  });

  it("drops a slug that could leave the clinic path", () => {
    expect(patientReturnPath("../admin")).toBe("/");
    expect(patientAuthPath("centar/prijava", "registracija")).toBe("/");
  });
});
