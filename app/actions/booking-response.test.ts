import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { acceptRequest, loadPendingRequests, loadRequestSection, rejectRequest } from "./appointments";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const otherDentistId = "33333333-3333-4333-8333-333333333333";
const ownerMemberId = "88888888-8888-4888-8888-888888888888";
const requestId = "44444444-4444-4444-8444-444444444444";
const otherRequestId = "99999999-9999-4999-8999-999999999999";
const appointmentId = "55555555-5555-4555-8555-555555555555";
const otherAppointmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const accountId = "66666666-6666-4666-8666-666666666666";
const otherAccountId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherPatientId = "77777777-7777-4777-8777-777777777777";
const ownerUserId = "10000000-0000-4000-8000-000000000004";
const dentistUserId = "10000000-0000-4000-8000-000000000002";
const receptionUserId = "10000000-0000-4000-8000-000000000003";
const foreignName = "Milan";
const foreignLastName = "Marković";

type Row = Record<string, unknown>;

function orMatches(row: Row, expression: string): boolean {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of expression) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (char === "," && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts.some((part) => {
    const match = /^(\w+)\.(eq|gt|gte|lt|lte)\.(?:"([^"]*)"|(.+))$/.exec(part.trim());
    if (!match) return false;
    const actual = row[match[1] ?? ""] == null ? "" : String(row[match[1] ?? ""]);
    const expected = match[3] ?? match[4] ?? "";
    if (match[2] === "eq") return actual === expected;
    if (match[2] === "gt") return actual > expected;
    if (match[2] === "gte") return actual >= expected;
    if (match[2] === "lt") return actual < expected;
    return actual <= expected;
  });
}

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
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
    expires_at: "2026-12-30T08:00:00.000Z",
    created_at: "2026-10-23T08:00:00.000Z",
    patient_note: null,
    pii_purged_at: null,
    ...overrides,
  };
}

function appointmentRow(id: string, dentistId: string): Row {
  return {
    id,
    clinic_id: clinicId,
    dentist_id: dentistId,
    patient_id: null,
    status: "pending_confirmation",
    starts_at: "2026-10-24T08:00:00.000Z",
  };
}

function createMemory(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const inserts: { table: string; row: Row }[] = [];
  const updates: { table: string; row: Row }[] = [];

  function from(table: string) {
    const rows = (tables[table] ??= []);
    const filters: Array<(row: Row) => boolean> = [];
    const sorts: Array<{ column: string; ascending: boolean }> = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    let rangeFrom: number | null = null;
    let rangeTo: number | null = null;
    let headOnly = false;
    const matched = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const builder = {
      select(_columns?: unknown, options?: { count?: string; head?: boolean }) {
        headOnly = options?.head === true;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      gt(column: string, value: unknown) {
        filters.push((row) => String(row[column] ?? "") > String(value));
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      or(expression: string) {
        filters.push((row) => orMatches(row, expression));
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        sorts.push({ column, ascending: options?.ascending !== false });
        return builder;
      },
      range(from: number, to: number) {
        rangeFrom = from;
        rangeTo = to;
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
        onFulfilled: (value: { data: Row[] | null; error: null; count: number }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const foundAll = matched();
        if (patch) {
          for (const row of foundAll) Object.assign(row, patch);
        }
        let found = foundAll.slice();
        if (sorts.length > 0) {
          found.sort((left, right) => {
            for (const sort of sorts) {
              const av = left[sort.column];
              const bv = right[sort.column];
              if (av === bv) continue;
              const as = av == null ? "" : String(av);
              const bs = bv == null ? "" : String(bv);
              if (as < bs) return sort.ascending ? -1 : 1;
              if (as > bs) return sort.ascending ? 1 : -1;
            }
            return 0;
          });
        }
        const count = found.length;
        if (rangeFrom != null && rangeTo != null) {
          found = found.slice(rangeFrom, rangeTo + 1);
        }
        const data = headOnly ? null : found.map((row) => ({ ...row }));
        return Promise.resolve({ data, error: null, count }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return { from, tables, inserts, updates };
}

function staffMemory(patients: Row[] = [], extraRequests: Row[] = []) {
  return createMemory({
    clinic_members: [
      {
        id: ownerMemberId,
        clinic_id: clinicId,
        user_id: ownerUserId,
        first_name: "Olga",
        last_name: "Vlasnik",
        role: "owner",
      },
      {
        id: actorId,
        clinic_id: clinicId,
        user_id: dentistUserId,
        first_name: "Mina",
        last_name: "Minić",
        role: "dentist",
      },
      {
        id: otherDentistId,
        clinic_id: clinicId,
        user_id: "10000000-0000-4000-8000-000000000005",
        first_name: "Boris",
        last_name: "Borić",
        role: "dentist",
      },
      {
        id: "12121212-1212-4121-8121-121212121212",
        clinic_id: clinicId,
        user_id: receptionUserId,
        first_name: "Rada",
        last_name: "Recepcija",
        role: "reception",
      },
    ],
    booking_requests: [requestRow(), ...extraRequests],
    appointments: [
      appointmentRow(appointmentId, actorId),
      appointmentRow(otherAppointmentId, otherDentistId),
    ],
    patients,
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

describe("acceptRequest", () => {
  it("opens a chart and links the account when nothing matches", async () => {
    const memory = staffMemory();
    mocks.createClient.mockResolvedValue(memory);

    const result = await acceptRequest(null, form({ zahtev: requestId, odluka: "prihvati" }));

    const patient = memory.tables.patients[0];
    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(patient).toMatchObject({
      clinic_id: clinicId,
      first_name: "Ana",
      last_name: "Anić",
      email: "ana@example.com",
      phone: "+381641112233",
      date_of_birth: "1992-03-04",
      slug: "ana-anic",
    });
    expect(memory.inserts.map((item) => item.table)).toEqual(["patients", "patient_chart_links"]);
    expect(memory.inserts[1].row).toMatchObject({
      clinic_id: clinicId,
      patient_id: patient.id,
      account_id: accountId,
      dependent_id: null,
      confirmed_at: null,
    });
    expect(memory.tables.appointments[0]).toMatchObject({
      status: "scheduled",
      patient_id: patient.id,
      confirmed_by: actorId,
    });
    expect(memory.tables.booking_requests[0]).toMatchObject({
      status: "accepted",
      patient_id: patient.id,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/danas");
  });

  it("stops a foreign email at chart choice and does not show the other name", async () => {
    const memory = staffMemory([
      {
        id: otherPatientId,
        clinic_id: clinicId,
        first_name: foreignName,
        last_name: foreignLastName,
        email: "ana@example.com",
        date_of_birth: "1980-01-01",
        merged_into_id: null,
        slug: "milan-markovic",
      },
    ]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await acceptRequest(null, form({ zahtev: requestId, odluka: "prihvati" }));

    expect(result).toEqual({ ok: true, data: { chartChoice: true } });
    expect(JSON.stringify(result)).not.toContain(foreignName);
    expect(JSON.stringify(result)).not.toContain(foreignLastName);
    expect(memory.inserts).toEqual([]);
    expect(memory.updates).toEqual([]);
    expect(memory.tables.patients[0]).toMatchObject({ first_name: foreignName, last_name: foreignLastName });
    expect(memory.tables.booking_requests[0]).toMatchObject({ status: "pending", patient_id: null });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("links the chart the staff confirms without returning the other name", async () => {
    const memory = staffMemory([
      {
        id: otherPatientId,
        clinic_id: clinicId,
        first_name: foreignName,
        last_name: foreignLastName,
        email: "ana@example.com",
        date_of_birth: "1980-01-01",
        merged_into_id: null,
        slug: "milan-markovic",
      },
    ]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await acceptRequest(null, form({ zahtev: requestId, odluka: "isti" }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(JSON.stringify(result)).not.toContain(foreignName);
    expect(JSON.stringify(result)).not.toContain(foreignLastName);
    expect(JSON.stringify(memory.inserts)).not.toContain(foreignName);
    expect(JSON.stringify(memory.inserts)).not.toContain(foreignLastName);
    expect(memory.inserts.map((item) => item.table)).toEqual(["patient_chart_links"]);
    expect(memory.inserts[0].row).toMatchObject({
      clinic_id: clinicId,
      patient_id: otherPatientId,
      account_id: accountId,
      dependent_id: null,
      confirmed_at: null,
    });
    expect(memory.tables.patients[0]).toMatchObject({ first_name: foreignName });
    expect(memory.updates.filter((item) => item.table === "patients")).toEqual([]);
  });

  it("opens another chart when staff says it is a different patient", async () => {
    const memory = staffMemory([
      {
        id: otherPatientId,
        clinic_id: clinicId,
        first_name: foreignName,
        last_name: foreignLastName,
        email: "ana@example.com",
        date_of_birth: "1980-01-01",
        merged_into_id: null,
        slug: "milan-markovic",
      },
    ]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await acceptRequest(null, form({ zahtev: requestId, odluka: "drugi" }));

    const created = memory.inserts.find((item) => item.table === "patients");
    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(JSON.stringify(result)).not.toContain(foreignName);
    expect(JSON.stringify(memory.inserts)).not.toContain(foreignName);
    expect(JSON.stringify(memory.inserts)).not.toContain(foreignLastName);
    expect(created?.row).toMatchObject({
      first_name: "Ana",
      last_name: "Anić",
      email: null,
    });
    expect(memory.inserts.find((item) => item.table === "patient_chart_links")?.row).toMatchObject({
      patient_id: created?.row.id,
      account_id: accountId,
      clinic_id: clinicId,
    });
    expect(memory.tables.appointments[0]).toMatchObject({ patient_id: created?.row.id, status: "scheduled" });
  });

  it("refuses another dentist's request", async () => {
    const memory = staffMemory([], [
      requestRow({
        id: otherRequestId,
        dentist_id: otherDentistId,
        appointment_id: otherAppointmentId,
        account_id: otherAccountId,
        booker_email: "luka@example.com",
        patient_first_name: "Luka",
        patient_last_name: "Lukić",
      }),
    ]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await acceptRequest(null, form({ zahtev: otherRequestId, odluka: "prihvati" }));

    expect(result).toEqual({
      ok: false,
      error: "Samo vlasnik i stomatolog kome je termin tražen mogu da odgovore.",
    });
    expect(memory.inserts).toEqual([]);
    expect(memory.updates).toEqual([]);
  });

  it("lets the owner accept a request assigned to another dentist", async () => {
    mocks.requireMember.mockResolvedValue({ userId: ownerUserId, clinicId, role: "owner" });
    const memory = staffMemory();
    memory.tables.booking_requests[0].dentist_id = otherDentistId;
    memory.tables.appointments[0].dentist_id = otherDentistId;
    mocks.createClient.mockResolvedValue(memory);

    const result = await acceptRequest(null, form({ zahtev: requestId, odluka: "prihvati" }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(memory.inserts.map((item) => item.table)).toContain("patient_chart_links");
  });
});

describe("rejectRequest", () => {
  it("frees the slot and does not link the account", async () => {
    const memory = staffMemory([
      {
        id: otherPatientId,
        clinic_id: clinicId,
        first_name: foreignName,
        last_name: foreignLastName,
        email: "ana@example.com",
        date_of_birth: "1980-01-01",
        merged_into_id: null,
        slug: "milan-markovic",
      },
    ]);
    mocks.createClient.mockResolvedValue(memory);

    const result = await rejectRequest(null, form({ zahtev: requestId, poruka: "" }));

    expect(result).toEqual({ ok: true, data: { id: appointmentId } });
    expect(memory.inserts).toEqual([]);
    expect(memory.tables.booking_requests[0]).toMatchObject({ status: "rejected", patient_note: null });
    expect(memory.tables.appointments[0]).toMatchObject({
      status: "cancelled",
      cancelled_by: "staff",
      patient_id: null,
    });
    expect(JSON.stringify(result)).not.toContain(foreignName);
  });

  it("stores a message of 300 characters and refuses a longer one", async () => {
    const memory = staffMemory();
    mocks.createClient.mockResolvedValue(memory);
    const poruka = "a".repeat(300);

    const saved = await rejectRequest(null, form({ zahtev: requestId, poruka }));
    expect(saved).toEqual({ ok: true, data: { id: appointmentId } });
    expect(memory.tables.booking_requests[0]).toMatchObject({ patient_note: poruka });

    mocks.createClient.mockClear();
    const tooLong = await rejectRequest(null, form({ zahtev: requestId, poruka: "a".repeat(301) }));
    expect(tooLong).toEqual({
      ok: false,
      error: "Proverite unete podatke.",
      fieldErrors: { poruka: ["Poruka može imati najviše 300 znakova."] },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses reception", async () => {
    mocks.requireMember.mockResolvedValue({ userId: receptionUserId, clinicId, role: "reception" });

    const accepted = await acceptRequest(null, form({ zahtev: requestId, odluka: "prihvati" }));
    const rejected = await rejectRequest(null, form({ zahtev: requestId }));

    expect(accepted).toEqual({
      ok: false,
      error: "Samo vlasnik i stomatolog kome je termin tražen mogu da odgovore.",
    });
    expect(rejected).toEqual(accepted);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("loadPendingRequests", () => {
  it("shows the owner every request and the dentist only their own, without the other chart name", async () => {
    const memory = staffMemory(
      [
        {
          id: otherPatientId,
          clinic_id: clinicId,
          first_name: foreignName,
          last_name: foreignLastName,
          email: "ana@example.com",
          date_of_birth: "1980-01-01",
          merged_into_id: null,
          slug: "milan-markovic",
        },
      ],
      [
        requestRow({
          id: otherRequestId,
          dentist_id: otherDentistId,
          appointment_id: otherAppointmentId,
          account_id: otherAccountId,
          booker_email: "luka@example.com",
          patient_first_name: "Luka",
          patient_last_name: "Lukić",
          patient_date_of_birth: "2015-05-05",
        }),
      ],
    );
    mocks.createClient.mockResolvedValue(memory);
    mocks.requireMember.mockResolvedValue({ userId: ownerUserId, clinicId, role: "owner" });

    const owner = await loadPendingRequests();
    expect(owner.ok).toBe(true);
    if (!owner.ok) return;
    expect(owner.data.map((item) => item.name)).toEqual(["Ana Anić", "Luka Lukić"]);
    expect(owner.data[0]).toMatchObject({ needsChoice: true, dentistName: "Mina Minić", reason: "Kontrola" });
    expect(JSON.stringify(owner)).not.toContain(foreignName);
    expect(JSON.stringify(owner)).not.toContain(foreignLastName);

    mocks.requireMember.mockResolvedValue({ userId: dentistUserId, clinicId, role: "dentist" });
    const dentist = await loadPendingRequests();
    expect(dentist.ok).toBe(true);
    if (!dentist.ok) return;
    expect(dentist.data.map((item) => item.name)).toEqual(["Ana Anić"]);
    expect(JSON.stringify(dentist)).not.toContain(foreignName);
  });
});

const acceptedId = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const rejectedId = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const expiredId = "e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2";

describe("loadRequestSection", () => {
  it("counts every status for the owner and only the dentist's own rows", async () => {
    const memory = staffMemory(
      [],
      [
        requestRow({
          id: otherRequestId,
          dentist_id: otherDentistId,
          appointment_id: otherAppointmentId,
          account_id: otherAccountId,
          status: "declined_by_patient",
          created_at: "2026-10-22T08:00:00.000Z",
        }),
        requestRow({
          id: rejectedId,
          status: "rejected",
          patient_note: "Pun termin",
          created_at: "2026-10-21T08:00:00.000Z",
        }),
        requestRow({
          id: acceptedId,
          status: "accepted",
          created_at: "2026-10-20T08:00:00.000Z",
        }),
        requestRow({
          id: expiredId,
          status: "expired",
          patient_first_name: null,
          patient_last_name: null,
          booker_email: null,
          patient_date_of_birth: null,
          pii_purged_at: "2026-10-01T00:00:00.000Z",
        }),
      ],
    );
    mocks.createClient.mockResolvedValue(memory);
    mocks.requireMember.mockResolvedValue({ userId: ownerUserId, clinicId, role: "owner" });

    const pending = await loadRequestSection("pending", 1);
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.data.counts).toEqual({ pending: 1, accepted: 1, rejected: 2, expired: 1 });
    expect(pending.data.requests.map((item) => item.name)).toEqual(["Ana Anić"]);

    const rejected = await loadRequestSection("rejected", 1);
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.data.requests.map((item) => item.rejectedBy)).toEqual(["patient", "staff"]);
    expect(rejected.data.requests[1]?.note).toBe("Pun termin");
    expect(rejected.data.requests.every((item) => item.needsChoice === false)).toBe(true);

    const expired = await loadRequestSection("expired", 1);
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    expect(expired.data.requests.map((item) => item.name)).toEqual(["Identitet uklonjen"]);

    mocks.requireMember.mockResolvedValue({ userId: dentistUserId, clinicId, role: "dentist" });
    const dentist = await loadRequestSection("rejected", 1);
    expect(dentist.ok).toBe(true);
    if (!dentist.ok) return;
    expect(dentist.data.counts).toEqual({ pending: 1, accepted: 1, rejected: 1, expired: 1 });
    expect(dentist.data.requests.map((item) => item.rejectedBy)).toEqual(["staff"]);
  });

  it("returns at most 20 pending rows, soonest deadline first", async () => {
    const extra = Array.from({ length: 20 }, (_, index) =>
      requestRow({
        id: `aa000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        expires_at: `2027-01-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
        patient_first_name: `Ana${index}`,
      }),
    );
    const memory = staffMemory([], extra);
    mocks.createClient.mockResolvedValue(memory);
    mocks.requireMember.mockResolvedValue({ userId: ownerUserId, clinicId, role: "owner" });

    const first = await loadRequestSection("pending", 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.total).toBe(21);
    expect(first.data.requests).toHaveLength(20);
    expect(first.data.requests[0]?.name).toBe("Ana Anić");
    expect(first.data.requests[1]?.name).toBe("Ana0 Anić");

    const second = await loadRequestSection("pending", 2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.requests).toHaveLength(1);
    expect(second.data.requests[0]?.name).toBe("Ana19 Anić");
  });

  it("moves a pending request whose deadline has passed into expired", async () => {
    const memory = staffMemory(
      [],
      [
        requestRow({
          id: "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3",
          status: "pending",
          expires_at: "2026-10-30T08:00:00.000Z",
          created_at: "2026-10-29T08:00:00.000Z",
          patient_first_name: "Iva",
        }),
      ],
    );
    mocks.createClient.mockResolvedValue(memory);
    mocks.requireMember.mockResolvedValue({ userId: ownerUserId, clinicId, role: "owner" });

    const pending = await loadRequestSection("pending", 1);
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(pending.data.counts).toEqual({ pending: 1, accepted: 0, rejected: 0, expired: 1 });
    expect(pending.data.requests.map((item) => item.name)).toEqual(["Ana Anić"]);

    const expired = await loadRequestSection("expired", 1);
    expect(expired.ok).toBe(true);
    if (!expired.ok) return;
    expect(expired.data.requests.map((item) => item.name)).toEqual(["Iva Anić"]);
    expect(expired.data.requests[0]?.deadlineLabel).not.toBe("");
  });
});
