import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  requireMember: vi.fn(),
  loadClinicPublic: vi.fn(),
  createClient: vi.fn(),
  sendMail: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePatient: mocks.requirePatient,
  requireMember: mocks.requireMember,
}));
vi.mock("@/app/ordinacije/[slug]/load-clinic-public", () => ({
  loadClinicPublic: mocks.loadClinicPublic,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@/lib/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mail")>();
  return { ...actual, sendMail: mocks.sendMail };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { addChild, confirmChildLink, sendParentLink } from "@/app/actions/patient-account";
import { hashInviteToken } from "@/lib/clinic-invite";
import { MailError } from "@/lib/mail";

const clinic = {
  name: "Ordinacija Centar",
  slug: "centar",
  city: "Beograd",
  address: "Ulica 1",
  phone: "011111",
  description: "",
  logoUrl: null,
  dentists: [],
  maxAheadDays: 14,
  defaultDurationMin: 30,
};

const patientId = "50000000-0000-4000-8000-000000000005";
const contactId = "40000000-0000-4000-8000-000000000004";
const memberId = "20000000-0000-4000-8000-000000000002";
const inviteId = "60000000-0000-4000-8000-000000000006";

type DbResult = { data: unknown; error: { code?: string } | null };
type Query = { table: string; op: string; payload?: unknown };

const queries: Query[] = [];
let rpcResult: DbResult = { data: null, error: null };
let mailError: Error | null = null;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

function queryResult(table: string, op: string): DbResult {
  if (op === "insert" && table === "patient_dependents") {
    return { data: { id: "child-1" }, error: null };
  }
  if (op === "insert" && table === "patient_link_invites") {
    return { data: { id: inviteId }, error: null };
  }
  if (op === "delete") {
    return { data: null, error: null };
  }
  if (table === "clinic_members") {
    return { data: { id: memberId }, error: null };
  }
  if (table === "clinics") {
    return { data: { name: "Ordinacija Centar", slug: "centar" }, error: null };
  }
  if (table === "patients") {
    return {
      data: {
        id: patientId,
        email: null,
        date_of_birth: "2016-05-04",
        merged_into_id: null,
        first_name: "Mika",
        last_name: "Mikić",
      },
      error: null,
    };
  }
  if (table === "patient_contacts") {
    return { data: { id: contactId, email: "Roditelj@Example.com" }, error: null };
  }
  return { data: null, error: { code: "unexpected" } };
}

function supabase() {
  return {
    from(table: string) {
      let op = "select";
      let payload: unknown;
      const api = {
        select: () => api,
        insert: (value: unknown) => {
          op = "insert";
          payload = value;
          queries.push({ table, op, payload });
          return api;
        },
        update: (value: unknown) => {
          op = "update";
          payload = value;
          queries.push({ table, op, payload });
          return api;
        },
        delete: () => {
          op = "delete";
          queries.push({ table, op });
          return api;
        },
        eq: () => api,
        order: () => api,
        maybeSingle: async () => queryResult(table, op),
        single: async () => queryResult(table, op),
        then: (onFulfilled: (value: DbResult) => unknown) =>
          Promise.resolve(queryResult(table, op)).then(onFulfilled),
      };
      return api;
    },
    rpc: async () => rpcResult,
  };
}

beforeEach(() => {
  queries.length = 0;
  mailError = null;
  rpcResult = { data: null, error: null };
  process.env.TOKEN_PEPPER = "pepper";
  process.env.APP_URL = "https://dentassist.rs";
  mocks.requirePatient.mockReset();
  mocks.requireMember.mockReset();
  mocks.loadClinicPublic.mockReset();
  mocks.createClient.mockReset();
  mocks.sendMail.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.requirePatient.mockResolvedValue({
    userId: "user-1",
    accountId: "account-1",
    email: "roditelj@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
  mocks.requireMember.mockResolvedValue({
    userId: "user-2",
    clinicId: "clinic-1",
    role: "dentist",
  });
  mocks.loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  mocks.createClient.mockResolvedValue(supabase());
  mocks.sendMail.mockImplementation(async () => {
    if (mailError) {
      throw mailError;
    }
  });
});

afterEach(() => {
  delete process.env.TOKEN_PEPPER;
  delete process.env.APP_URL;
});

describe("patient account children", () => {
  it("adds a child the parent typed onto the account", async () => {
    const result = await addChild(
      null,
      form({
        slug: "centar",
        firstName: "Luka",
        lastName: "Lukić",
        dateOfBirth: "2017-04-05",
        relationship: "father",
      }),
    );

    expect(result).toEqual({ ok: true, data: { saved: true } });
    expect(queries).toEqual([
      {
        table: "patient_dependents",
        op: "insert",
        payload: {
          account_id: "account-1",
          first_name: "Luka",
          last_name: "Lukić",
          date_of_birth: "2017-04-05",
          relationship: "father",
        },
      },
    ]);
  });

  it("does not show a child name for an unconfirmed invite", async () => {
    rpcResult = { data: { status: "missing", first_name: "Mika", last_name: "Mikić" }, error: null };

    const result = await confirmChildLink(
      null,
      form({ slug: "centar", token: "abcdefghijklmnopqrstuvwxyz0123456789ABCDE" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Poziv nije važeći.");
      expect(result.error).not.toContain("Mika");
    }
    expect(JSON.stringify(result)).not.toContain("Mikić");
    expect(queries.some((query) => query.table === "patients")).toBe(false);
  });

  it("adds the child returned after the invite is confirmed", async () => {
    rpcResult = {
      data: {
        status: "ok",
        first_name: "Mika",
        last_name: "Mikić",
        date_of_birth: "2016-05-04",
        relationship: "mother",
      },
      error: null,
    };

    const result = await confirmChildLink(
      null,
      form({ slug: "centar", token: "abcdefghijklmnopqrstuvwxyz0123456789ABCDE" }),
    );

    expect(result).toEqual({
      ok: true,
      data: {
        firstName: "Mika",
        lastName: "Mikić",
        dateOfBirth: "2016-05-04",
        relationship: "mother",
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ordinacije/centar/deca");
  });

  it("mails a parent link without the child name or the chart email", async () => {
    const result = await sendParentLink(
      null,
      form({ patientSlug: "mika-mikic", contactId }),
    );

    expect(result).toEqual({ ok: true, data: { sent: true } });
    const insert = queries.find((query) => query.op === "insert");
    expect(insert?.table).toBe("patient_link_invites");
    expect(insert?.payload).toMatchObject({
      clinic_id: "clinic-1",
      patient_id: patientId,
      email: "roditelj@example.com",
      created_by: memberId,
    });
    expect(insert?.payload).not.toHaveProperty("first_name");
    expect(queries.some((query) => query.table === "patients" && query.op !== "select")).toBe(false);

    const mail = mocks.sendMail.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe("roditelj@example.com");
    expect(mail.subject).toBe("Povežite karton deteta");
    expect(mail.text).not.toContain("Mika");
    expect(mail.text).not.toContain("Mikić");
    const link = mail.text.match(
      /https:\/\/dentassist\.rs\/ordinacije\/centar\/povezi\/([A-Za-z0-9_-]+)/,
    );
    expect(link?.[1]).toBeTruthy();
    expect(insert?.payload).toMatchObject({
      token_hash: hashInviteToken(link?.[1] ?? "", "pepper"),
    });
  });

  it("lets an owner send and refuses reception before any write", async () => {
    mocks.requireMember.mockResolvedValue({
      userId: "user-1",
      clinicId: "clinic-1",
      role: "owner",
    });
    await expect(
      sendParentLink(null, form({ patientSlug: "mika-mikic", contactId })),
    ).resolves.toEqual({ ok: true, data: { sent: true } });

    queries.length = 0;
    mocks.requireMember.mockResolvedValue({
      userId: "user-3",
      clinicId: "clinic-1",
      role: "reception",
    });
    const refused = await sendParentLink(null, form({ patientSlug: "mika-mikic", contactId }));
    expect(refused).toEqual({
      ok: false,
      error: "Ovu radnju mogu stomatolog i vlasnik.",
    });
    expect(queries).toEqual([]);
  });

  it("removes the invite when the mail does not go out", async () => {
    mailError = new MailError("rate_limit_exceeded");
    const result = await sendParentLink(null, form({ patientSlug: "mika-mikic", contactId }));
    expect(result.ok).toBe(false);
    expect(queries.some((query) => query.table === "patient_link_invites" && query.op === "delete")).toBe(
      true,
    );
    expect(mocks.sendMail.mock.calls[0]?.[0].text).not.toContain("Mika");
  });
});
