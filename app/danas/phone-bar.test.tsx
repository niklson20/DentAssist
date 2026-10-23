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

vi.mock("@/app/actions/appointments", () => ({
  acceptRequest: vi.fn(async () => ({ ok: true, data: { id: "appointment" } })),
  rejectRequest: vi.fn(async () => ({ ok: true, data: { id: "appointment" } })),
}));

import { belgradeLocalToISO } from "@/lib/calendar-dates";

import { CalendarShell } from "./calendar-shell";
import { dayFromRows } from "./day-calendar";
import { DayGrid } from "./day-grid";
import { PendingColumn } from "./pending-column";
import { PhoneBar } from "./phone-bar";
import { PhoneDayList, phoneDayColumn } from "./phone-day-list";

const datum = "2026-10-23";
const ana = "11111111-1111-4111-8111-111111111111";
const boris = "22222222-2222-4222-8222-222222222222";
const mika = "44444444-4444-4444-8444-444444444444";

const pageSource = readFileSync(path.join(process.cwd(), "app/danas/page.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");
const barSource = readFileSync(path.join(process.cwd(), "app/danas/phone-bar.tsx"), "utf8");
const listSource = readFileSync(path.join(process.cwd(), "app/danas/phone-day-list.tsx"), "utf8");
const testSource = readFileSync(path.join(process.cwd(), "app/danas/phone-bar.test.tsx"), "utf8");

function at(hour: number, minute: number): string {
  return belgradeLocalToISO({ year: 2026, month: 10, day: 23, hour, minute });
}

const model = dayFromRows({
  datum,
  hideCancelled: true,
  members: [
    { id: boris, first_name: "Boris", last_name: "Borić", sees_patients: true },
    { id: ana, first_name: "Ana", last_name: "Anić", sees_patients: true },
  ],
  appointments: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      dentist_id: ana,
      patient_id: mika,
      starts_at: at(10, 0),
      ends_at: at(10, 30),
      status: "scheduled",
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7",
      dentist_id: boris,
      patient_id: null,
      starts_at: at(14, 0),
      ends_at: at(14, 30),
      status: "scheduled",
    },
  ],
  patients: [{ id: mika, first_name: "Mika", last_name: "Mikić" }],
  hours: [
    { clinic_member_id: ana, is_closed: false, opens_at: "09:00:00", closes_at: "17:00:00" },
    { clinic_member_id: boris, is_closed: false, opens_at: "09:00:00", closes_at: "17:00:00" },
  ],
});

describe("phone calendar", () => {
  it("keeps Testing Library and Supabase out of the phone screen", () => {
    expect(testSource).not.toMatch(/from ["']@testing-library\/react["']/);
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource.toLowerCase()).not.toContain("supabase");
    expect(barSource.toLowerCase()).not.toContain("supabase");
    expect(listSource.toLowerCase()).not.toContain("supabase");
    expect(barSource).toContain("signOutStaff");
    expect(barSource).toContain('href="/pacijenti"');
    expect(barSource).toContain('href="/podesavanja"');
    expect(pageSource).toContain("PhoneDayList");
    expect(pageSource).toContain("pendingColumn");
    expect(shellSource).not.toContain("Zahtevi za termine biće prikazani ovde");
    expect(shellSource).not.toContain("Pacijenti će biti prikazani ovde");
    expect(shellSource).not.toContain("#");
    expect(barSource).not.toContain("#");
    expect(listSource).not.toContain("#");
    expect(listSource).toContain("border-border");
    expect(listSource).toContain("bg-secondary");
    expect(listSource).toContain("text-destructive");
  });

  it("opens requests first from the pending column and lists one dentist, not a day grid", () => {
    expect(model).not.toBeNull();
    if (!model) {
      return;
    }

    const html = renderToStaticMarkup(
      <CalendarShell
        query={{
          datum,
          prikaz: "dan",
          stomatolog: ana,
          sakrijOtkazane: true,
        }}
        pendingColumn={
          <PendingColumn
            role="owner"
            requests={[
              {
                id: "44444444-4444-4444-8444-444444444444",
                timeLabel: "10:00",
                name: "Mila Milić",
                dentistName: "Ana Anić",
                reason: "Kontrola",
                deadlineLabel: "24. okt, 10:00",
                needsChoice: false,
              },
            ]}
          />
        }
        phoneCalendar={<PhoneDayList model={model} dentistId={ana} />}
        dayCalendar={<DayGrid model={model} />}
      />,
    );

    const requestsPanel = html.slice(
      html.indexOf('id="phone-requests-panel"'),
      html.indexOf('id="phone-calendar-panel"'),
    );
    const calendarPanel = html.slice(
      html.indexOf('id="phone-calendar-panel"'),
      html.indexOf('aria-label="Mobilna navigacija"'),
    );
    const wideCalendar = html.slice(html.lastIndexOf('aria-label="Kalendar"'));

    expect(requestsPanel).toContain("Čeka potvrdu");
    expect(requestsPanel).toContain("Mila Milić");
    expect(requestsPanel).toContain("Kontrola");
    expect(requestsPanel).toContain("Prihvati");
    expect(requestsPanel).not.toContain("Zahtevi za termine biće prikazani ovde");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Zahtevi");

    expect(calendarPanel).toContain("Ana Anić");
    expect(calendarPanel).toContain("Mika Mikić");
    expect(calendarPanel).not.toContain("Boris Borić");
    expect(calendarPanel).not.toContain("calendar-grid");
    expect(calendarPanel).not.toContain("Pacijenti će biti prikazani ovde");

    expect(wideCalendar).toContain("calendar-grid");
    expect(wideCalendar).toContain("Boris Borić");

    expect(html).toContain('href="/pacijenti"');
    expect(html).toContain('href="/podesavanja"');
    expect(html).toContain("Odjava");
    expect(html).toContain("Podešavanja");
    expect(html).toContain("Još");
  });

  it("lists one dentist's visits for the day and ignores the other column", () => {
    expect(model).not.toBeNull();
    if (!model) {
      return;
    }

    const anaColumn = phoneDayColumn(model, ana);
    expect(anaColumn?.name).toBe("Ana Anić");
    expect(anaColumn?.visits.map((visit) => visit.label)).toEqual(["Mika Mikić"]);

    const html = renderToStaticMarkup(<PhoneDayList model={model} dentistId={ana} />);
    expect(html).toContain("Ana Anić");
    expect(html).toContain("Mika Mikić");
    expect(html).toContain('data-status="scheduled"');
    expect(html).not.toContain("Boris Borić");
    expect(html).not.toContain("calendar-grid");

    const borisHtml = renderToStaticMarkup(<PhoneDayList model={model} dentistId={boris} />);
    expect(borisHtml).toContain("Boris Borić");
    expect(borisHtml).not.toContain("Mika Mikić");
    expect(borisHtml).not.toContain("Ana Anić");
  });

  it("opens patients, settings, and sign-out from the phone bar", () => {
    const html = renderToStaticMarkup(<PhoneBar activeTab="requests" onTabChange={() => undefined} />);
    expect(html).toContain("Zahtevi");
    expect(html).toContain("Kalendar");
    expect(html).toContain("Pacijenti");
    expect(html).toContain("Još");
    expect(html).toContain('href="/pacijenti"');
    expect(html).toContain('href="/podesavanja"');
    expect(html).toContain("Podešavanja");
    expect(html).toContain("Odjava");
    expect(html).toContain('type="submit"');
  });
});
