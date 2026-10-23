import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  loadClinicPublic: vi.fn(),
  loadSelfBooking: vi.fn(),
  createClient: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePatient: mocks.requirePatient }));
vi.mock("@/app/ordinacije/[slug]/load-clinic-public", () => ({
  loadClinicPublic: mocks.loadClinicPublic,
}));
vi.mock("@/app/ordinacije/[slug]/zakazivanje/load-self-booking", () => ({
  loadSelfBooking: mocks.loadSelfBooking,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/lib/mail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mail")>();
  return { ...actual, sendMail: mocks.sendMail };
});

import { submitChildBooking, submitSelfBooking } from "@/app/actions/booking";
import { MailError } from "@/lib/mail";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";
const when = "četvrtak, 22. oktobar 2026., 11:30";
const requestId = "99999999-9999-4999-8999-999999999999";
const newChildId = "55555555-5555-4555-8555-555555555555";
const milaId = "22222222-2222-4222-8222-222222222222";

const clinic = {
  name: "Ordinacija Centar",
  slug: "centar",
  city: "Novi Sad",
  address: "Knez Mihailova 1",
  phone: "011123456",
  description: "",
  logoUrl: null,
  dentists: [{ id: dentistId, firstName: "Mina", lastName: "Minić" }],
  maxAheadDays: 14,
  defaultDurationMin: 30,
};

const profile = {
  firstName: "Ana",
  lastName: "Anić",
  phone: "+38160111222",
  email: "ana@example.com",
  dateOfBirth: "1990-01-01",
};

const mila = {
  id: milaId,
  firstName: "Mila",
  lastName: "Milić",
  dateOfBirth: "2020-04-01",
  relationship: "mother" as const,
  linked: true,
};

const received =
  "Zahtev za termin je primljen. Ordinacija Centar treba da ga potvrdi. Ana Anić, " +
  `${when}, Mina Minić, Knez Mihailova 1. Telefon: 011123456.`;

type RpcError = { message: string; code?: string } | null;

let rpcResult: { data: unknown; error: RpcError } = { data: requestId, error: null };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

function identity(overrides: Record<string, string> = {}) {
  return form({
    slug: "centar",
    stomatolog: dentistId,
    pocetak: startsAt,
    reason: "Kontrola",
    firstName: "Ana",
    lastName: "Anić",
    dateOfBirth: "1990-01-01",
    phone: "060 111 222",
    email: "ana@example.com",
    consent: "yes",
    ...overrides,
  });
}

function childIdentity(overrides: Record<string, string> = {}) {
  return form({
    slug: "centar",
    stomatolog: dentistId,
    pocetak: startsAt,
    reason: "",
    dependentId: "",
    childFirstName: "Mila",
    childLastName: "Milić",
    childDateOfBirth: "2020-04-01",
    relationship: "mother",
    contactFirstName: "Ana",
    contactLastName: "Anić",
    contactPhone: "060 111 222",
    contactEmail: "ana@example.com",
    guardian: "yes",
    consent: "yes",
    ...overrides,
  });
}

beforeEach(() => {
  rpcResult = { data: requestId, error: null };
  mocks.requirePatient.mockReset();
  mocks.loadClinicPublic.mockReset();
  mocks.loadSelfBooking.mockReset();
  mocks.createClient.mockReset();
  mocks.sendMail.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.sendMail.mockResolvedValue(undefined);
  mocks.requirePatient.mockResolvedValue({
    userId: "user-1",
    accountId: "account-1",
    email: "Ana@Example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
  mocks.loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  mocks.loadSelfBooking.mockResolvedValue({
    status: "ready",
    selfLinked: false,
    profile,
    children: [mila],
  });
  mocks.createClient.mockResolvedValue({
    from() {
      const api = {
        insert() {
          return api;
        },
        select() {
          return api;
        },
        eq() {
          return api;
        },
        single: async () => ({ data: { id: newChildId }, error: null }),
      };
      return api;
    },
    rpc() {
      return Promise.resolve(rpcResult);
    },
  });
});

describe("request received email", () => {
  it("emails the patient after the request and does not email the clinic", async () => {
    const result = await submitSelfBooking(null, identity());

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "ana@example.com",
      subject: "Zahtev je primljen",
      fromName: "Ordinacija Centar",
      text: received,
    });
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { to: string; text: string };
    expect(mail.to).not.toContain("011123456");
    expect(mail.text).not.toContain("+38160111222");
    expect(mail.text).not.toContain("Novi Sad");
    expect(mail.text).not.toMatch(/https?:/i);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses the account name when the chart is already linked", async () => {
    mocks.loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: true,
      profile: { ...profile, firstName: "Tuđi", lastName: "Karton" },
      children: [],
    });

    const result = await submitSelfBooking(
      null,
      form({
        slug: "centar",
        stomatolog: dentistId,
        pocetak: startsAt,
        reason: "",
      }),
    );

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(JSON.stringify(result)).not.toContain("Tuđi");
    const mail = mocks.sendMail.mock.calls[0]?.[0] as { to: string; text: string };
    expect(mail.to).toBe("ana@example.com");
    expect(mail.text).toContain("Tuđi Karton");
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });

  it("emails the parent about the child and not a second address", async () => {
    const result = await submitChildBooking(
      null,
      childIdentity({ patientEmail: "dete@example.com" }),
    );

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(JSON.stringify(result)).not.toContain("Mila");
    expect(JSON.stringify(result)).not.toContain("dete@example.com");
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith({
      to: "ana@example.com",
      subject: "Zahtev je primljen",
      fromName: "Ordinacija Centar",
      text:
        "Zahtev za termin je primljen. Ordinacija Centar treba da ga potvrdi. Mila Milić, " +
        `${when}, Mina Minić, Knez Mihailova 1. Telefon: 011123456.`,
    });
  });

  it("does not send when the request is not created", async () => {
    rpcResult = { data: null, error: { message: "slot is not available", code: "P0001" } };

    const taken = await submitSelfBooking(null, identity());
    expect(taken.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();

    const wrongEmail = await submitSelfBooking(null, identity({ email: "drugi@example.com" }));
    expect(wrongEmail.ok).toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it("keeps the stored request when the mail send fails", async () => {
    mocks.sendMail.mockRejectedValue(new MailError("validation_error"));

    const result = await submitSelfBooking(null, identity());

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(mocks.sendMail).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith("request_received mail failed:", "validation_error");
  });
});
