import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  loadClinicPublic: vi.fn(),
  loadSelfBooking: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePatient: mocks.requirePatient };
});
vi.mock("../load-clinic-public", () => ({ loadClinicPublic: mocks.loadClinicPublic }));
vi.mock("./load-self-booking", () => ({ loadSelfBooking: mocks.loadSelfBooking }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));

import { submitChildBooking } from "@/app/actions/booking";

import Page from "./page";
import {
  CHILD_BOOKS_ALONE,
  childBookingIdentitySchema,
  GUARDIAN_STATEMENT,
  NOT_PROCEDURE_CONSENT,
} from "./schema";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";
const milaId = "22222222-2222-4222-8222-222222222222";
const lukaId = "44444444-4444-4444-8444-444444444444";

const clinic = {
  name: "Ordinacija Centar",
  slug: "centar",
  city: "Beograd",
  address: "Ulica 1",
  phone: "011111",
  description: "",
  logoUrl: null,
  dentists: [{ id: dentistId, firstName: "Mina", lastName: "Minić" }],
  maxAheadDays: 14,
  defaultDurationMin: 30,
};

const adult = {
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

const luka = {
  id: lukaId,
  firstName: "Luka",
  lastName: "Lukić",
  dateOfBirth: "2018-02-02",
  relationship: "father" as const,
  linked: false,
};

function renderPage(search: { stomatolog?: string; pocetak?: string; dete?: string } = {}) {
  return Page({
    params: Promise.resolve({ slug: "Centar" }),
    searchParams: Promise.resolve({ stomatolog: dentistId, pocetak: startsAt, ...search }),
  });
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
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
  mocks.requirePatient.mockReset();
  mocks.loadClinicPublic.mockReset();
  mocks.loadSelfBooking.mockReset();
  mocks.createClient.mockReset();
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
    profile: adult,
    children: [mila, luka],
  });
});

describe("child booking page", () => {
  it("keeps a new child separate from the account email and asks for the guardian statement", async () => {
    mocks.loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: false,
      profile: { ...adult, dateOfBirth: "2020-01-01" },
      children: [],
    });

    const html = renderToStaticMarkup(await renderPage());

    expect(html.indexOf("child-first-name")).toBeLessThan(html.indexOf("child-last-name"));
    expect(html.indexOf("child-last-name")).toBeLessThan(html.indexOf("child-birth"));
    expect(html.indexOf("child-birth")).toBeLessThan(html.indexOf("child-relationship"));
    expect(html.indexOf("child-relationship")).toBeLessThan(html.indexOf("contact-first-name"));
    expect(html.indexOf("contact-first-name")).toBeLessThan(html.indexOf("contact-last-name"));
    expect(html.indexOf("contact-last-name")).toBeLessThan(html.indexOf("contact-phone"));
    expect(html.indexOf("contact-phone")).toBeLessThan(html.indexOf("contact-email"));
    expect(html.indexOf("contact-email")).toBeLessThan(html.indexOf("child-reason"));
    expect(html.indexOf("child-reason")).toBeLessThan(html.indexOf("child-guardian"));
    expect(html.indexOf("child-guardian")).toBeLessThan(html.indexOf("child-consent"));
    expect(html).toContain("2020-01-01");
    expect(html).toContain(GUARDIAN_STATEMENT);
    expect(html).toContain(NOT_PROCEDURE_CONSENT);
    expect(html).toContain("ana@example.com");
    expect(html).toContain("Majka");
    expect(html).toContain("Otac");
    expect(html).toContain("Staratelj");
    expect(html).toContain("Baba");
    expect(html).toContain("Deda");
    expect(html).toContain("Drugi srodnik");
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('name="phone"');
    expect(html).not.toContain('name="firstName"');
    expect(html).toContain("Pošalji zahtev");
  });

  it("skips identity when that child is already linked in this clinic", async () => {
    const html = renderToStaticMarkup(await renderPage({ dete: milaId }));

    expect(html).toContain("Termin je za Mila Milić.");
    expect(html).toContain(GUARDIAN_STATEMENT);
    expect(html).toContain("Pošalji zahtev");
    expect(html).not.toContain('id="child-first-name"');
    expect(html).not.toContain('name="contactEmail"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("Slažem se");
    expect(html).not.toContain("ana@example.com");
    expect(html).not.toContain("Ana");
    expect(html).not.toContain("Tuđi Karton");
  });

  it("still asks for identity when the child is not linked in this clinic", async () => {
    const html = renderToStaticMarkup(await renderPage({ dete: lukaId }));

    expect(html).toContain('id="child-first-name"');
    expect(html).toContain("Luka");
    expect(html).toContain('name="contactEmail"');
    expect(html).toContain("ana@example.com");
    expect(html).toContain(GUARDIAN_STATEMENT);
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("Tuđi Karton");
  });

  it("ignores a child id that is not on this account", async () => {
    const html = renderToStaticMarkup(await renderPage({ dete: "33333333-3333-4333-8333-333333333333" }));

    expect(html).toContain('id="booking-first-name"');
    expect(html).not.toContain("Tuđi Karton");
    expect(html).not.toContain("Zakazivanje za dete");
  });
});

describe("submitChildBooking", () => {
  it("accepts a linked child without identity and does not keep a patient email", async () => {
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

    expect(result).toEqual({ ok: true, data: { ready: true } });
    expect(JSON.stringify(result)).not.toContain("dete@example.com");
    expect(JSON.stringify(result)).not.toContain("Mila");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.requirePatient).toHaveBeenCalledWith({
      purpose: "request",
      slug: "centar",
      stomatolog: dentistId,
      pocetak: startsAt,
    });
  });

  it("requires the guardian statement when identity is skipped", async () => {
    const result = await submitChildBooking(
      null,
      form({
        slug: "centar",
        stomatolog: dentistId,
        pocetak: startsAt,
        reason: "",
        dependentId: milaId,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.guardian).toEqual(["Potvrdite izjavu staratelja."]);
    }
  });

  it("requires the guardian statement and keeps email on the contact for a new child", async () => {
    const missing = childIdentity();
    missing.delete("guardian");

    const rejected = await submitChildBooking(null, missing);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.fieldErrors?.guardian).toEqual(["Potvrdite izjavu staratelja."]);
    }

    const wrongEmail = await submitChildBooking(null, childIdentity({ contactEmail: "drugi@example.com" }));
    expect(wrongEmail.ok).toBe(false);
    if (!wrongEmail.ok) {
      expect(wrongEmail.fieldErrors?.contactEmail).toEqual(["Mejl je mejl ovog naloga."]);
    }

    const accepted = await submitChildBooking(
      null,
      childIdentity({ patientEmail: "dete@example.com" }),
    );
    expect(accepted).toEqual({ ok: true, data: { ready: true } });
    expect(JSON.stringify(accepted)).not.toContain("dete@example.com");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("refuses a child who has turned 15 and a dependent from another account", async () => {
    const grown = await submitChildBooking(null, childIdentity({ childDateOfBirth: "2000-01-01" }));
    expect(grown).toEqual({ ok: false, error: CHILD_BOOKS_ALONE });

    mocks.loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: false,
      profile: { ...adult, firstName: "Tuđi" },
      children: [{ ...mila, dateOfBirth: "2000-01-01", linked: true }],
    });
    const linkedGrown = await submitChildBooking(
      null,
      form({
        slug: "centar",
        stomatolog: dentistId,
        pocetak: startsAt,
        reason: "",
        dependentId: milaId,
        guardian: "yes",
      }),
    );
    expect(linkedGrown).toEqual({ ok: false, error: CHILD_BOOKS_ALONE });
    expect(JSON.stringify(linkedGrown)).not.toContain("Tuđi");

    const foreign = await submitChildBooking(
      null,
      form({
        slug: "centar",
        stomatolog: dentistId,
        pocetak: startsAt,
        reason: "",
        dependentId: "33333333-3333-4333-8333-333333333333",
        guardian: "yes",
      }),
    );
    expect(foreign.ok).toBe(false);
    expect(JSON.stringify(foreign)).not.toContain("Tuđi");
  });

  it("does not let an unconfirmed email submit a child booking", async () => {
    mocks.requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/registracija"));

    await expect(submitChildBooking(null, childIdentity())).rejects.toThrow(
      "REDIRECT:/ordinacije/centar/registracija",
    );
    expect(mocks.loadSelfBooking).not.toHaveBeenCalled();
  });
});

describe("child booking schema", () => {
  it("stores the account email as the contact and drops a patient email", () => {
    const parsed = childBookingIdentitySchema.safeParse({
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
      contactPhone: "060111222",
      contactEmail: "Ana@Example.com",
      guardian: "yes",
      consent: "yes",
      email: "dete@example.com",
      patientEmail: "dete@example.com",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contactEmail).toBe("ana@example.com");
      expect(parsed.data).not.toHaveProperty("email");
      expect(parsed.data).not.toHaveProperty("patientEmail");
    }
  });
});

describe("linked_child_ids", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261028120000_linked_child_ids.sql"),
    "utf8",
  );

  function functionBody(name: string): string {
    const start = sql.indexOf(`function public.${name}`);
    const open = sql.indexOf("as $$", start);
    const close = sql.indexOf("$$;", open);
    return sql.slice(open, close).toLowerCase();
  }

  it("returns only this account's dependent ids in this clinic", () => {
    const body = functionBody("linked_child_ids");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("from public.patient_accounts as account");
    expect(body).toContain("account.user_id = auth.uid()");
    expect(body).toContain("from public.patient_chart_links as link");
    expect(body).toContain("link.account_id = v_account_id");
    expect(body).toContain("link.dependent_id is not null");
    expect(body).toContain("lower(clinic.slug) = v_slug");
    expect(body).not.toContain("from public.patients");
    expect(body).not.toContain("first_name");
    expect(body).not.toContain("email");
    expect(body).not.toMatch(/\bjmbg\b/);

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("grant execute on function public.linked_child_ids(text) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.linked_child_ids\(text\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.linked_child_ids\(text\) to service_role/);
  });
});
