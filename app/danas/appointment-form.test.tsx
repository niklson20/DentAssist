import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/danas",
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));
vi.mock("@/app/actions/appointments", () => ({
  createAppointment: vi.fn(async () => null),
}));

import { AppointmentForm, type AppointmentFormChoices } from "./appointment-form";
import { CalendarShell } from "./calendar-shell";

const dentistId = "22222222-2222-4222-8222-222222222222";
const patientId = "33333333-3333-4333-8333-333333333333";
const typeId = "44444444-4444-4444-8444-444444444444";
const DAY = "2026-06-08";

const formSource = readFileSync(path.join(process.cwd(), "app/danas/appointment-form.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");

function choices(dateOfBirth: string, hasContact = false): AppointmentFormChoices {
  return {
    slotMinutes: 15,
    dentists: [{ id: dentistId, label: "Mina Minić" }],
    patients: [{ id: patientId, label: "Ana Anić", dateOfBirth, hasContact }],
    types: [{ id: typeId, label: "Pregled" }],
  };
}

function renderForm(dateOfBirth: string, hasContact = false): string {
  return renderToStaticMarkup(
    <AppointmentForm choices={choices(dateOfBirth, hasContact)} datum={DAY} today={DAY} />,
  );
}

describe("appointment form", () => {
  it("asks for a parent contact when the patient is under 15", () => {
    const html = renderForm("2012-03-01");
    const names = ["stomatolog", "pacijent", "pocetak", "trajanje", "tip", "napomena"];
    let cursor = -1;
    for (const name of names) {
      const index = html.indexOf(`name="${name}"`);
      expect(index).toBeGreaterThan(cursor);
      cursor = index;
    }
    expect(html.indexOf('name="kontaktOdnos"')).toBeGreaterThan(cursor);
    expect(html).toContain("Stomatolog");
    expect(html).toContain("Pacijent");
    expect(html).toContain("Početak");
    expect(html).toContain("Trajanje");
    expect(html).toContain("Tip");
    expect(html).toContain("Napomena");
    expect(html).toContain("Kontakt roditelja ili srodnika");
    expect(html).toContain('name="kontaktIme"');
    expect(html).toContain('name="kontaktPrezime"');
    expect(html).toContain('name="kontaktTelefon"');
  });

  it("leaves the contact off the form for an adult", () => {
    const html = renderForm("1990-01-01");
    expect(html).toContain('name="stomatolog"');
    expect(html).toContain('name="pacijent"');
    expect(html).not.toContain("Kontakt roditelja");
    expect(html).not.toContain('name="kontaktIme"');
  });

  it("opens from a button on the calendar", () => {
    const html = renderToStaticMarkup(
      <CalendarShell
        query={{ prikaz: "dan", datum: DAY, stomatolog: null, sakrijOtkazane: true }}
      />,
    );
    expect(html).toContain("Novi termin");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('name="pacijent"');
    expect(shellSource).toContain("<Dialog");
    expect(shellSource).toContain("<DialogContent");
    expect(shellSource).toContain("<AppointmentForm");
    expect(shellSource).toContain("embedded");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
    expect(shellSource).not.toContain("#");
    expect(formSource).toContain("text-destructive");
    expect(formSource).toContain("border-border");
    expect(formSource).toContain("bg-card");
  });
});
