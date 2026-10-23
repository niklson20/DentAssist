import { beforeEach, describe, expect, it, vi } from "vitest";

import { belgradeLocalToISO } from "@/lib/calendar-dates";

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireMember: mocks.requireMember }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));

import { sendOffer } from "./appointments";

const DAY = "2026-06-08";
const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const otherDentistId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const accountId = "66666666-6666-4666-8666-666666666666";
const typeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const dentistUserId = "10000000-0000-4000-8000-000000000002";
const receptionUserId = "10000000-0000-4000-8000-000000000003";
const slug = "mina";
const deadline = "2027-01-15T10:00:00.000Z";

type Row = Record<string, unknown>;

function at(hour: number, minute: number): string {
  return belgradeLocalToISO({ year: 2026, month: 6, day: 8, hour, minute });
}

const requested = at(10, 0);
const requestedEnd = at(10, 30);
const early = at(11, 0);
const mid = at(13, 0);
const late = at(15, 0);
const extra = at(16, 0);
const blocked = at(9, 0);

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) data.append(key, item);
    } else {
      data.set(key, value);
    }
  }
  return data;
}

function requestRow(overrides: Row = {}): Row {
  return {
    id: requestId,
    clinic_id: clinicId,
    dentist_id: actorId,
    account_id: accountId,
    booker_email: "ana@example.com",
    for_child: false,
    patient_first_name: "Ana",
    patient_last_name: "Anić",
    patient_date_of_birth: "1992-03-04",
    patient_phone: "+381641112233",
    contact_relationship: null,
    contact_first_name: null,
    contact_last_name: null,
    contact_phone: null,
    reason: "Kontrola",
    patient_id: null,
    appointment_id: appointmentId,
    status: "pending",
    expires_at: deadline,
    ...overrides,
  };
}

function holdRow(): Row {
  return {
    id: appointmentId,
    clinic_id: clinicId,
    dentist_id: actorId,
    patient_id: null,
    booking_request_id: requestId,
    starts_at: requested,
    ends_at: requestedEnd,
    appointment_type_id: typeId,
    status: "pending_confirmation",
    source: "patient",
  };
}

function createMemory(slots: string[], seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    clinic_members: [
      {
        id: actorId,
        clinic_id: clinicId,
        user_id: dentistUserId,
        role: "dentist",
      },
    ],
    clinics: [{ id: clinicId, slug, buffer_minutes: 0 }],
    booking_requests: [requestRow()],
    appointments: [holdRow()],
    appointment_offers: [],
  };
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const inserts: { table: string; row: Row }[] = [];
  const updates: { table: string; row: Row }[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const matched = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      insert(row: Row) {
        const next: Row = { ...row };
        if (typeof next.id !== "string") next.id = `created-${table}-${rows.length + 1}`;
        inserted = next;
        rows.push(next);
        inserts.push({ table, row: next });
        return builder;
      },
      update(row: Row) {
        patch = row;
        updates.push({ table, row });
        return builder;
      },
      maybeSingle() {
        if (inserted && !patch) return Promise.resolve({ data: { ...inserted }, error: null });
        const found = matched();
        if (patch) {
          for (const row of found) Object.assign(row, patch);
        }
        if (found.length !== 1) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({ data: { ...found[0] }, error: null });
      },
      single() {
        return builder.maybeSingle().then((result) => {
          if (!result.data) return { data: null, error: { message: "missing" } };
          return { data: result.data, error: null };
        });
      },
      then(
        onFulfilled: (value: { data: Row[]; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const found = matched();
        if (patch) {
          for (const row of found) Object.assign(row, patch);
        }
        return Promise.resolve({ data: found.map((row) => ({ ...row })), error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    from,
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({
        data: slots.map((starts_at) => ({ starts_at })),
        error: null,
      });
    },
    tables,
    inserts,
    updates,
    rpcCalls,
  };
}

function expectRequestUnchanged(memory: ReturnType<typeof createMemory>) {
  expect(memory.updates).toEqual([]);
  expect(memory.tables.booking_requests[0]).toMatchObject({
    status: "pending",
    expires_at: deadline,
  });
  expect(memory.tables.appointments[0]).toMatchObject({
    id: appointmentId,
    status: "pending_confirmation",
    starts_at: requested,
    ends_at: requestedEnd,
  });
}

beforeEach(() => {
  mocks.requireMember.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requireMember.mockResolvedValue({
    userId: dentistUserId,
    clinicId,
    role: "dentist",
  });
});

describe("sendOffer", () => {
  it("keeps the requested hour and adds up to three offered starts in addition order", async () => {
    const memory = createMemory([early, mid, late, extra]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await sendOffer(null, form({ zahtev: requestId, pocetak: [late, early, mid] }));

    const createdAppointments = memory.inserts.filter((item) => item.table === "appointments");
    const createdOffers = memory.inserts.filter((item) => item.table === "appointment_offers");
    const duration = Date.parse(requestedEnd) - Date.parse(requested);

    expect(result).toEqual({ ok: true, data: { id: requestId } });
    expect(memory.rpcCalls).toEqual([
      {
        name: "get_available_slots",
        args: { slug, dentist_id: actorId, day: DAY },
      },
    ]);
    expect(createdAppointments.map((item) => item.row.starts_at)).toEqual([late, early, mid]);
    expect(createdAppointments.map((item) => item.row.status)).toEqual(["offered", "offered", "offered"]);
    expect(createdAppointments.every((item) => item.row.booking_request_id === requestId)).toBe(true);
    expect(createdAppointments.every((item) => item.row.dentist_id === actorId)).toBe(true);
    expect(createdAppointments.every((item) => item.row.patient_id === null)).toBe(true);
    expect(createdAppointments.every((item) => item.row.appointment_type_id === typeId)).toBe(true);
    for (const item of createdAppointments) {
      expect(Date.parse(String(item.row.ends_at)) - Date.parse(String(item.row.starts_at))).toBe(duration);
    }
    expect(createdOffers.map((item) => item.row.position)).toEqual([1, 2, 3]);
    expect(createdOffers.map((item) => item.row.appointment_id)).toEqual(
      createdAppointments.map((item) => item.row.id),
    );
    expect(createdOffers.every((item) => item.row.booking_request_id === requestId)).toBe(true);
    expect(memory.tables.appointments.filter((row) => row.status === "offered")).toHaveLength(3);
    expect(memory.tables.appointments.filter((row) => row.status === "pending_confirmation")).toHaveLength(1);
    expect(memory.inserts.some((item) => item.row.starts_at === requested)).toBe(false);
    expectRequestUnchanged(memory);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("refuses the requested hour and leaves the request occupied", async () => {
    const memory = createMemory([requested, early, mid, late]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await sendOffer(null, form({ zahtev: requestId, pocetak: [requested, early] }));

    expect(result).toEqual({
      ok: false,
      error: "Traženi sat je zauzet.",
      fieldErrors: { pocetak: ["Traženi sat je zauzet."] },
    });
    expect(memory.inserts).toEqual([]);
    expect(memory.rpcCalls).toEqual([]);
    expectRequestUnchanged(memory);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a start the public calendar does not list", async () => {
    const memory = createMemory([early, mid, late]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await sendOffer(null, form({ zahtev: requestId, pocetak: [blocked] }));

    expect(blocked).toContain(DAY);
    expect(result).toEqual({
      ok: false,
      error: "Izaberite slobodan početak.",
      fieldErrors: { pocetak: ["Izaberite slobodan početak."] },
    });
    expect(memory.inserts).toEqual([]);
    expectRequestUnchanged(memory);
  });

  it("refuses zero and four starts before it touches the database", async () => {
    const none = await sendOffer(null, form({ zahtev: requestId }));
    const four = await sendOffer(null, form({ zahtev: requestId, pocetak: [early, mid, late, extra] }));

    expect(none).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { pocetak: ["Izaberite bar jedan početak."] },
    });
    expect(four).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { pocetak: ["Možete ponuditi najviše tri termina."] },
    });
    expect(mocks.requireMember).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses reception and another dentist without changing the request", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: receptionUserId,
      clinicId,
      role: "reception",
    });

    const reception = await sendOffer(null, form({ zahtev: requestId, pocetak: [early] }));
    expect(reception).toEqual({
      ok: false,
      error: "Samo vlasnik i stomatolog kome je termin tražen mogu da odgovore.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();

    mocks.requireMember.mockResolvedValue({
      userId: dentistUserId,
      clinicId,
      role: "dentist",
    });
    const memory = createMemory([early]);
    memory.tables.booking_requests[0].dentist_id = otherDentistId;
    memory.tables.appointments[0].dentist_id = otherDentistId;
    mocks.createClient.mockResolvedValue(memory);

    const other = await sendOffer(null, form({ zahtev: requestId, pocetak: [early] }));

    expect(other).toEqual({
      ok: false,
      error: "Samo vlasnik i stomatolog kome je termin tražen mogu da odgovore.",
    });
    expect(memory.inserts).toEqual([]);
    expect(memory.tables.booking_requests[0]).toMatchObject({
      status: "pending",
      expires_at: deadline,
    });
  });
});
