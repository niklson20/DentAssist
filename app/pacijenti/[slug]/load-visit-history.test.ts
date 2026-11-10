import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: mocks.from,
  })),
}));

import { CHART_HISTORY_STATUSES, loadVisitHistory, visitsFromRows } from "./load-visit-history";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patientId = "22222222-2222-4222-8222-222222222222";
const dentistId = "33333333-3333-4333-8333-333333333333";
const appointmentId = "44444444-4444-4444-8444-444444444444";
const olderAppointmentId = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  mocks.from.mockReset();
});

describe("CHART_HISTORY_STATUSES", () => {
  it("matches PRD history statuses and omits offered holds", () => {
    expect(CHART_HISTORY_STATUSES).toEqual([
      "pending_confirmation",
      "scheduled",
      "completed",
      "no_show",
      "cancelled",
    ]);
  });
});

describe("visitsFromRows", () => {
  it("maps appointments to history items with the newest first", () => {
    const visits = visitsFromRows(
      [
        {
          id: olderAppointmentId,
          dentist_id: dentistId,
          starts_at: "2025-06-08T08:00:00.000Z",
          status: "completed",
        },
        {
          id: appointmentId,
          dentist_id: dentistId,
          starts_at: "2026-11-10T08:00:00.000Z",
          status: "completed",
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          dentist_id: dentistId,
          starts_at: "2026-11-11T08:00:00.000Z",
          status: "offered",
        },
      ],
      [{ id: dentistId, first_name: "Ana", last_name: "Anić" }],
    );

    expect(visits).toEqual([
      {
        id: appointmentId,
        status: "completed",
        dentist: "Ana Anić",
        date: "2026-11-10",
      },
      {
        id: olderAppointmentId,
        status: "completed",
        dentist: "Ana Anić",
        date: "2025-06-08",
      },
    ]);
  });

  it("attaches visit notes only to completed appointments when requested", () => {
    const note = {
      procedureDescription: "Plomba",
      recommendations: "Hladan oblog",
      treatmentPlan: "Kontrola",
      internalNotes: "Bez komplikacija",
    };
    const visits = visitsFromRows(
      [
        {
          id: appointmentId,
          dentist_id: dentistId,
          starts_at: "2026-11-10T08:00:00.000Z",
          status: "completed",
        },
        {
          id: olderAppointmentId,
          dentist_id: dentistId,
          starts_at: "2026-11-09T08:00:00.000Z",
          status: "completed",
        },
        {
          id: "66666666-6666-4666-8666-666666666666",
          dentist_id: dentistId,
          starts_at: "2026-11-11T08:00:00.000Z",
          status: "no_show",
        },
      ],
      [{ id: dentistId, first_name: "Ana", last_name: "Anić" }],
      {
        includeNotes: true,
        notesByAppointment: new Map([[appointmentId, note]]),
      },
    );

    expect(visits).toEqual([
      {
        id: "66666666-6666-4666-8666-666666666666",
        status: "no_show",
        dentist: "Ana Anić",
        date: "2026-11-11",
      },
      {
        id: appointmentId,
        status: "completed",
        dentist: "Ana Anić",
        date: "2026-11-10",
        note,
      },
      {
        id: olderAppointmentId,
        status: "completed",
        dentist: "Ana Anić",
        date: "2026-11-09",
        note: null,
      },
    ]);
  });
});

describe("loadVisitHistory", () => {
  it("loads the patient appointments for the chart history tab", async () => {
    const appointments = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: appointmentId,
            dentist_id: dentistId,
            starts_at: "2026-11-10T08:00:00.000Z",
            status: "completed",
          },
        ],
        error: null,
      }),
    };
    const members = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: dentistId, first_name: "Ana", last_name: "Anić" }],
        error: null,
      }),
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointments") return appointments;
      if (table === "clinic_members") return members;
      throw new Error(table);
    });

    await expect(loadVisitHistory(clinicId, patientId)).resolves.toEqual([
      {
        id: appointmentId,
        status: "completed",
        dentist: "Ana Anić",
        date: "2026-11-10",
      },
    ]);
    expect(appointments.eq).toHaveBeenCalledWith("clinic_id", clinicId);
    expect(appointments.eq).toHaveBeenCalledWith("patient_id", patientId);
    expect(appointments.in).toHaveBeenCalledWith("status", [...CHART_HISTORY_STATUSES]);
  });

  it("loads visit notes for completed appointments when requested", async () => {
    const appointments = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: appointmentId,
            dentist_id: dentistId,
            starts_at: "2026-11-10T08:00:00.000Z",
            status: "completed",
          },
          {
            id: olderAppointmentId,
            dentist_id: dentistId,
            starts_at: "2026-11-09T08:00:00.000Z",
            status: "no_show",
          },
        ],
        error: null,
      }),
    };
    const members = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: dentistId, first_name: "Ana", last_name: "Anić" }],
        error: null,
      }),
    };
    const notes = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [
          {
            appointment_id: appointmentId,
            procedure_description: "Plomba",
            recommendations: "Hladan oblog",
            treatment_plan: "Kontrola",
            internal_notes: "Bez komplikacija",
          },
        ],
        error: null,
      }),
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "appointments") return appointments;
      if (table === "clinic_members") return members;
      if (table === "visits") return notes;
      throw new Error(table);
    });

    await expect(loadVisitHistory(clinicId, patientId, { includeNotes: true })).resolves.toEqual([
      {
        id: appointmentId,
        status: "completed",
        dentist: "Ana Anić",
        date: "2026-11-10",
        note: {
          procedureDescription: "Plomba",
          recommendations: "Hladan oblog",
          treatmentPlan: "Kontrola",
          internalNotes: "Bez komplikacija",
        },
      },
      {
        id: olderAppointmentId,
        status: "no_show",
        dentist: "Ana Anić",
        date: "2026-11-09",
      },
    ]);
    expect(notes.in).toHaveBeenCalledWith("appointment_id", [appointmentId]);
  });

  it("returns null when appointments cannot be loaded", async () => {
    mocks.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }),
    });

    await expect(loadVisitHistory(clinicId, patientId)).resolves.toBeNull();
  });
});
