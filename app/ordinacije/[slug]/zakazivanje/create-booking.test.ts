import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  loadClinicPublic: vi.fn(),
  loadSelfBooking: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requirePatient: mocks.requirePatient }));
vi.mock("@/app/ordinacije/[slug]/load-clinic-public", () => ({
  loadClinicPublic: mocks.loadClinicPublic,
}));
vi.mock("@/app/ordinacije/[slug]/zakazivanje/load-self-booking", () => ({
  loadSelfBooking: mocks.loadSelfBooking,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));

import { submitChildBooking, submitSelfBooking } from "@/app/actions/booking";
import { bookingRequestStatusLabel } from "@/lib/labels";

import { bookingFollowUp } from "./self-booking-form";
import {
  PHONE_REQUIRED,
  REQUEST_RECEIVED,
  SLOT_TAKEN,
  TWO_PENDING,
  freeStartsHref,
} from "./schema";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";
const requestId = "99999999-9999-4999-8999-999999999999";
const newChildId = "55555555-5555-4555-8555-555555555555";
const milaId = "22222222-2222-4222-8222-222222222222";

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

type RpcError = { message: string; code?: string } | null;

const rpcCalls: { name: string; args: unknown }[] = [];
const inserts: { table: string; payload: unknown }[] = [];
let rpcResult: { data: unknown; error: RpcError } = { data: requestId, error: null };
let insertResult: { data: unknown; error: { code?: string } | null } = {
  data: { id: newChildId },
  error: null,
};

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
  rpcCalls.length = 0;
  inserts.length = 0;
  rpcResult = { data: requestId, error: null };
  insertResult = { data: { id: newChildId }, error: null };
  mocks.requirePatient.mockReset();
  mocks.loadClinicPublic.mockReset();
  mocks.loadSelfBooking.mockReset();
  mocks.createClient.mockReset();
  mocks.revalidatePath.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    children: [],
  });
  mocks.createClient.mockResolvedValue({
    from(table: string) {
      const api = {
        insert(payload: unknown) {
          inserts.push({ table, payload });
          return api;
        },
        select() {
          return api;
        },
        eq() {
          return api;
        },
        single: async () => insertResult,
      };
      return api;
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
  });
});

describe("create booking request", () => {
  it("creates a pending request for a confirmed account", async () => {
    const result = await submitSelfBooking(null, identity());

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(rpcCalls).toEqual([
      {
        name: "create_booking",
        args: {
          slug: "centar",
          dentist_id: dentistId,
          starts_at: startsAt,
          for_child: false,
          dependent_id: null,
          phone: "+38160111222",
          date_of_birth: "1990-01-01",
          contact: null,
          reason: "Kontrola",
        },
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(freeStartsHref("centar"));
    expect(JSON.stringify(result)).not.toContain("karton");
    expect(JSON.stringify(result)).not.toContain("Tuđi");
  });

  it("uses the same public result when the chart is already linked", async () => {
    mocks.loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: true,
      profile: { ...profile, firstName: "Tuđi" },
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
    expect(rpcCalls[0]).toMatchObject({
      name: "create_booking",
      args: { for_child: false, dependent_id: null, reason: null },
    });
    expect(JSON.stringify(rpcCalls)).not.toContain("Tuđi");
    expect(JSON.stringify(result)).not.toContain("karton");
  });

  it("does not create a request for an anonymous visitor", async () => {
    mocks.requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/prijava"));

    await expect(submitSelfBooking(null, identity())).rejects.toThrow(
      "REDIRECT:/ordinacije/centar/prijava",
    );
    await expect(submitChildBooking(null, childIdentity())).rejects.toThrow(
      "REDIRECT:/ordinacije/centar/prijava",
    );

    expect(rpcCalls).toEqual([]);
    expect(inserts).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not create a request when the email is still unconfirmed", async () => {
    mocks.requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/registracija"));

    await expect(submitSelfBooking(null, identity())).rejects.toThrow(
      "REDIRECT:/ordinacije/centar/registracija",
    );

    expect(rpcCalls).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns a taken slot to free starts without asking for a code", async () => {
    rpcResult = { data: null, error: { message: "slot is not available", code: "P0001" } };

    const result = await submitSelfBooking(null, identity());
    const html = renderToStaticMarkup(bookingFollowUp(result, "centar"));

    expect(result).toEqual({ ok: false, error: SLOT_TAKEN });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/ordinacije/centar");
    expect(html).toContain(SLOT_TAKEN);
    expect(html).toContain('href="/ordinacije/centar"');
    expect(html).toContain("Slobodni počeci");
    expect(html).not.toContain('name="code"');
    expect(html.toLowerCase()).not.toContain("unesite kod");
    expect(html.toLowerCase()).not.toContain("kod");
  });

  it("shows one public message and Čeka potvrdu after the request is sent", () => {
    const html = renderToStaticMarkup(
      bookingFollowUp({ ok: true, data: { status: "pending" } }, "centar"),
    );

    expect(html).toContain(REQUEST_RECEIVED);
    expect(html).toContain(bookingRequestStatusLabel("pending"));
    expect(html.toLowerCase()).not.toContain("karton");
    expect(html.toLowerCase()).not.toContain("postoji");
    expect(html).not.toContain('name="code"');
    expect(html.toLowerCase()).not.toContain("kod");
  });

  it("books a linked child through create_booking and keeps the child email off the request", async () => {
    mocks.loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: false,
      profile,
      children: [mila],
    });

    const result = await submitChildBooking(
      null,
      form({
        slug: "centar",
        stomatolog: dentistId,
        pocetak: startsAt,
        reason: "",
        dependentId: milaId,
        guardian: "yes",
        patientEmail: "dete@example.com",
        email: "dete@example.com",
      }),
    );

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(inserts).toEqual([]);
    expect(rpcCalls).toEqual([
      {
        name: "create_booking",
        args: {
          slug: "centar",
          dentist_id: dentistId,
          starts_at: startsAt,
          for_child: true,
          dependent_id: milaId,
          phone: "+38160111222",
          date_of_birth: "2020-04-01",
          contact: null,
          reason: null,
        },
      },
    ]);
    expect(JSON.stringify(rpcCalls)).not.toContain("dete@example.com");
  });

  it("saves a new child and then creates the request for that child", async () => {
    const result = await submitChildBooking(null, childIdentity({ patientEmail: "dete@example.com" }));

    expect(result).toEqual({ ok: true, data: { status: "pending" } });
    expect(inserts).toEqual([
      {
        table: "patient_dependents",
        payload: {
          account_id: "account-1",
          first_name: "Mila",
          last_name: "Milić",
          date_of_birth: "2020-04-01",
          relationship: "mother",
        },
      },
    ]);
    expect(rpcCalls).toEqual([
      {
        name: "create_booking",
        args: {
          slug: "centar",
          dentist_id: dentistId,
          starts_at: startsAt,
          for_child: true,
          dependent_id: newChildId,
          phone: "+38160111222",
          date_of_birth: "2020-04-01",
          contact: null,
          reason: null,
        },
      },
    ]);
    expect(JSON.stringify(inserts)).not.toContain("dete@example.com");
    expect(JSON.stringify(result)).not.toContain("dete@example.com");
  });

  it("does not call create_booking when the new child cannot be saved", async () => {
    insertResult = { data: null, error: { code: "42501" } };

    const result = await submitChildBooking(null, childIdentity());

    expect(result).toEqual({
      ok: false,
      error: "Zakazivanje trenutno nije dostupno. Pokušajte ponovo.",
    });
    expect(rpcCalls).toEqual([]);
  });

  it("keeps a third pending request from being created", async () => {
    rpcResult = {
      data: null,
      error: { message: "this chart already has two pending requests in this clinic", code: "P0001" },
    };

    const result = await submitSelfBooking(null, identity());

    expect(result).toEqual({ ok: false, error: TWO_PENDING });
    expect(JSON.stringify(result).toLowerCase()).not.toContain("karton");
    expect(JSON.stringify(result).toLowerCase()).not.toContain("chart");
    expect(bookingFollowUp(result, "centar")).toBeNull();
  });

  it("asks for a phone without a confirmation code when the account has none", async () => {
    rpcResult = { data: null, error: { message: "phone is required", code: "P0001" } };

    const result = await submitSelfBooking(null, identity());
    const html = renderToStaticMarkup(bookingFollowUp(result, "centar"));

    expect(result).toEqual({ ok: false, error: PHONE_REQUIRED });
    expect(html).toBe("");
  });

  it("keeps supabase and the confirmation code off this screen", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/zakazivanje/page.tsx"),
      "utf8",
    );
    const formSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/zakazivanje/self-booking-form.tsx"),
      "utf8",
    );
    const actionSource = readFileSync(path.join(process.cwd(), "app/actions/booking.ts"), "utf8");

    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).not.toContain("create_booking");
    expect(formSource).not.toContain("create_booking");
    expect(pageSource).not.toContain('name="code"');
    expect(formSource).not.toContain('name="code"');
    expect(formSource).toContain("bookingFollowUp(result, slug)");
    expect(actionSource).toContain('rpc("create_booking"');
    expect(actionSource).not.toContain('from("booking_requests")');
    expect(actionSource).not.toContain('from("appointments")');
  });
});
