import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatBelgrade } from "@/lib/calendar-dates";

const { requirePatient, loadClinicPublic, loadSelfBooking } = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  loadClinicPublic: vi.fn(),
  loadSelfBooking: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requirePatient };
});
vi.mock("../load-clinic-public", () => ({ loadClinicPublic }));
vi.mock("./load-self-booking", () => ({ loadSelfBooking }));

import Page from "./page";
import { bookingConsentText } from "./schema";

const dentistId = "11111111-1111-4111-8111-111111111111";
const startsAt = "2026-10-22T09:30:00.000Z";

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

function renderPage(search: { stomatolog?: string; pocetak?: string } = { stomatolog: dentistId, pocetak: startsAt }) {
  return Page({
    params: Promise.resolve({ slug: "Centar" }),
    searchParams: Promise.resolve(search),
  });
}

beforeEach(() => {
  requirePatient.mockReset();
  loadClinicPublic.mockReset();
  loadSelfBooking.mockReset();
  requirePatient.mockResolvedValue({
    userId: "user-1",
    accountId: "account-1",
    email: "ana@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
  loadClinicPublic.mockResolvedValue({ status: "ready", clinic });
  loadSelfBooking.mockResolvedValue({
    status: "ready",
    selfLinked: false,
    profile: adult,
  });
});

describe("self booking page", () => {
  it("keeps supabase out of the page and the form", () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/ordinacije/[slug]/zakazivanje/page.tsx"), "utf8");
    const formSource = readFileSync(
      path.join(process.cwd(), "app/ordinacije/[slug]/zakazivanje/self-booking-form.tsx"),
      "utf8",
    );
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).toContain('purpose: "request"');
  });

  it("does not show the form when the visitor is sent to login", async () => {
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/prijava"));

    await expect(renderPage()).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");

    expect(requirePatient).toHaveBeenCalledWith({
      purpose: "request",
      slug: "centar",
      stomatolog: dentistId,
      pocetak: startsAt,
    });
    expect(loadSelfBooking).not.toHaveBeenCalled();
  });

  it("does not show the form when the email is not confirmed", async () => {
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/registracija"));

    await expect(renderPage()).rejects.toThrow("REDIRECT:/ordinacije/centar/registracija");
    expect(requirePatient).toHaveBeenCalledWith(expect.objectContaining({ purpose: "request" }));
    expect(loadSelfBooking).not.toHaveBeenCalled();
  });

  it("shows the account fields when this clinic has no chart link", async () => {
    const html = renderToStaticMarkup(await renderPage());
    const start = new Date(startsAt);
    const when = `${formatBelgrade(start, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}, ${formatBelgrade(start, { hour: "2-digit", minute: "2-digit" })}`;

    expect(loadSelfBooking).toHaveBeenCalledWith("account-1", "centar");
    expect(html.indexOf("booking-first-name")).toBeLessThan(html.indexOf("booking-last-name"));
    expect(html.indexOf("booking-last-name")).toBeLessThan(html.indexOf("booking-birth"));
    expect(html.indexOf("booking-birth")).toBeLessThan(html.indexOf("booking-phone"));
    expect(html.indexOf("booking-phone")).toBeLessThan(html.indexOf("booking-email"));
    expect(html.indexOf("booking-email")).toBeLessThan(html.indexOf("booking-reason"));
    expect(html.indexOf("booking-reason")).toBeLessThan(html.indexOf("booking-consent"));
    expect(html).toContain("Ana");
    expect(html).toContain("Anić");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("+38160111222");
    expect(html).toContain("1990-01-01");
    expect(html).toContain(bookingConsentText("Ordinacija Centar"));
    expect(html).toContain("Pošalji zahtev");
    expect(html).toContain("Mina Minić");
    expect(html).toContain(when);
    expect(html).not.toContain("Zakazivanje za dete");
    expect(html).not.toContain("Tuđi Karton");
  });

  it("shows an empty identity form on the first request", async () => {
    loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: false,
      profile: { ...adult, phone: null, dateOfBirth: null },
    });

    const html = renderToStaticMarkup(await renderPage());

    expect(html).toContain('id="booking-first-name"');
    expect(html).toContain('id="booking-birth"');
    expect(html).toContain("Pošalji zahtev");
    expect(html).toContain(bookingConsentText("Ordinacija Centar"));
  });

  it("hides identity fields when the account is already linked in this clinic", async () => {
    loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: true,
      profile: adult,
    });

    const html = renderToStaticMarkup(await renderPage());

    expect(html).toContain("Pošalji zahtev");
    expect(html).toContain("Termin je za vas");
    expect(html).not.toContain('name="firstName"');
    expect(html).not.toContain('name="lastName"');
    expect(html).not.toContain('name="dateOfBirth"');
    expect(html).not.toContain('name="phone"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("Slažem se");
    expect(html).not.toContain("Ana");
    expect(html).not.toContain("Anić");
    expect(html).not.toContain("ana@example.com");
    expect(html).not.toContain("Tuđi Karton");
  });

  it("keeps an under-15 birth date on the child path", async () => {
    loadSelfBooking.mockResolvedValue({
      status: "ready",
      selfLinked: false,
      profile: { ...adult, dateOfBirth: "2020-01-01" },
    });

    const html = renderToStaticMarkup(await renderPage());

    expect(html).toContain("Zakazivanje za dete");
    expect(html).toContain("2020-01-01");
    expect(html).toContain("Osoba još nema 15 godina.");
    expect(html).toContain("Zakazujem kao roditelj ili zakonski staratelj.");
    expect(html).toContain('name="contactEmail"');
    expect(html).toContain("Pošalji zahtev");
    expect(html).not.toContain('name="firstName"');
    expect(html).not.toContain('name="email"');
  });

  it("does not show the form when the clinic is closed", async () => {
    loadClinicPublic.mockResolvedValue({ status: "unavailable" });

    const html = renderToStaticMarkup(await renderPage());

    expect(requirePatient).not.toHaveBeenCalled();
    expect(html).toContain("Ova ordinacija nije dostupna za online zakazivanje.");
    expect(html).not.toContain("Pošalji zahtev");
  });

  it("asks for a slot before showing identity fields", async () => {
    const html = renderToStaticMarkup(await renderPage({}));

    expect(requirePatient).toHaveBeenCalled();
    expect(loadSelfBooking).not.toHaveBeenCalled();
    expect(html).toContain("Izaberite slobodan početak.");
    expect(html).not.toContain('name="firstName"');
    expect(html).not.toContain("Pošalji zahtev");
  });

  it("hides the form when the link cannot be read", async () => {
    loadSelfBooking.mockResolvedValue({
      status: "unavailable",
      message: "Zakazivanje trenutno nije dostupno. Pokušajte ponovo.",
    });

    const html = renderToStaticMarkup(await renderPage());

    expect(html).toContain("Zakazivanje trenutno nije dostupno. Pokušajte ponovo.");
    expect(html).not.toContain("Pošalji zahtev");
    expect(html).not.toContain('name="firstName"');
  });
});
