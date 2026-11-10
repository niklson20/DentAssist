import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";
import { formatBelgradeDate } from "@/lib/calendar-dates";

const { requireMember } = vi.hoisted(() => ({
  requireMember: vi.fn(),
}));

const nav = vi.hoisted(() => ({
  pathname: "/danas",
}));

vi.mock("@/lib/auth", () => ({ requireMember }));
vi.mock("@phosphor-icons/react", () => {
  const Icon = () => <svg />;
  return {
    CalendarBlank: Icon,
    ChartBar: Icon,
    Gear: Icon,
    ClipboardText: Icon,
    SignOut: Icon,
    CaretLeft: Icon,
    CaretRight: Icon,
    SidebarIcon: Icon,
    Tooth: Icon,
    Users: Icon,
    XIcon: Icon,
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: "page" | "date";
    "aria-label"?: string;
    "aria-pressed"?: boolean;
  }) => (
    <a
      href={href}
      className={className}
      aria-current={props["aria-current"]}
      aria-label={props["aria-label"]}
      aria-pressed={props["aria-pressed"]}
    >
      {children}
    </a>
  ),
}));

import { AppMenuClient } from "@/components/ui/app-menu-client";
import { staffMenuItems, usesStaffShellMenu } from "@/components/ui/staff-menu";
import { CalendarShell } from "./calendar-shell";
import { DateJump } from "./date-jump";
import Page from "./page";
import { calendarPath, hasCanonicalCalendarParams, readCalendarQuery } from "./schema";

const dentistId = "22222222-2222-4222-8222-222222222222";
const today = "2026-10-23";

const pageSource = readFileSync(path.join(process.cwd(), "app/danas/page.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");
const menuSource = readFileSync(path.join(process.cwd(), "components/ui/app-menu.tsx"), "utf8");
const menuClientSource = readFileSync(path.join(process.cwd(), "components/ui/app-menu-client.tsx"), "utf8");

beforeEach(() => {
  requireMember.mockReset();
  requireMember.mockResolvedValue({ userId: "u1", clinicId: "c1", role: "dentist" });
  nav.pathname = "/danas";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calendar query", () => {
  it("opens on the week view for today", () => {
    expect(formatBelgradeDate(new Date())).toBe(today);
    expect(readCalendarQuery({}, today)).toEqual({
      prikaz: "nedelja",
      datum: today,
      stomatolog: null,
    });
    expect(hasCanonicalCalendarParams({}, readCalendarQuery({}, today))).toBe(false);
    expect(calendarPath(readCalendarQuery({}, today))).toBe(`/danas?prikaz=nedelja&datum=${today}`);
  });

  it("keeps the dentist in the address", () => {
    const params = {
      prikaz: "nedelja",
      datum: "2026-06-08",
      stomatolog: dentistId,
    };
    const query = readCalendarQuery(params, today);
    expect(query).toEqual({
      prikaz: "nedelja",
      datum: "2026-06-08",
      stomatolog: dentistId,
    });
    expect(hasCanonicalCalendarParams(params, query)).toBe(true);
    expect(calendarPath(query, { prikaz: "mesec" })).toBe(
      `/danas?prikaz=mesec&datum=2026-06-08&stomatolog=${dentistId}`,
    );
  });
});

describe("today page", () => {
  it("keeps Supabase out of the page, the calendar, and the menu", () => {
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource.toLowerCase()).not.toContain("supabase");
    expect(menuSource.toLowerCase()).not.toContain("supabase");
    expect(menuClientSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource).not.toContain("#");
    expect(menuClientSource).not.toContain("#");
    expect(menuSource).toContain("loadStaffMenuRole");
  });

  it("opens on a dated address without sakrijOtkazane", async () => {
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      `REDIRECT:/danas?prikaz=nedelja&datum=${today}`,
    );
  });

  it("shows the date and the three views", async () => {
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          prikaz: "dan",
          datum: today,
        }),
      }),
    );
    expect(html).toContain("Danas");
    expect(shellSource).not.toContain('font-semibold">Danas');
    expect(html).not.toContain('id="datum"');
    expect(html).toContain("Dan");
    expect(html).toContain("Nedelja");
    expect(html).toContain("Mesec");
    expect(html).toContain("Novi termin");
    expect(html).not.toContain("Nova blokada");
    expect(html).not.toContain("Ponudi");
    const views = html.indexOf('aria-label="Prikaz kalendara"');
    const calendar = html.indexOf('aria-label="Kalendar"', views);
    const todayLink = html.indexOf('aria-label="Idi na današnji dan"');
    expect(todayLink).toBeGreaterThan(views);
    expect(html).not.toContain("Zahtevi na čekanju");
    expect(html).toContain('href="/zahtevi"');
    expect(pageSource).toContain("mx-auto w-full max-w-5xl");
    expect(pageSource).not.toContain("PendingColumn");
    expect(html.indexOf("Novi termin")).toBeGreaterThan(views);
    expect(html.indexOf("Novi termin")).toBeLessThan(calendar);
    expect(html).toContain(`href="/danas?prikaz=dan&amp;datum=${today}"`);
    expect(html).toContain(`href="/danas?prikaz=nedelja&amp;datum=${today}"`);
    expect(html).toContain('aria-label="Prethodni dan"');
    expect(html).toContain('aria-label="Sledeći dan"');
    expect(html).toContain(`href="/danas?prikaz=dan&amp;datum=2026-10-22"`);
    expect(html).toContain(`href="/danas?prikaz=dan&amp;datum=2026-10-24"`);
    expect(html).not.toContain(">Prethodni dan<");
    expect(html).not.toContain(">Sledeći dan<");
    expect(html).not.toContain("Sakrij otkazane");
    expect(html).not.toContain("Prikaži otkazane");
    expect(html).not.toContain("sakrijOtkazane");
    expect(html).not.toContain("data-hide-cancelled");
    expect(shellSource).not.toContain("replaceState");
    expect(shellSource).toContain("<DateJump");
    expect(pageSource).not.toContain("<DateJump");
    expect(readFileSync(path.join(process.cwd(), "app/danas/date-jump.tsx"), "utf8")).not.toContain('id="datum"');
  });

  it("keeps the dentist in the address while moving the day and the view", () => {
    const html = renderToStaticMarkup(
      <CalendarShell
        query={{
          prikaz: "nedelja",
          datum: "2026-06-08",
          stomatolog: dentistId,
        }}
      />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Nedelja");
    const jump = renderToStaticMarkup(
      <DateJump
        query={{
          prikaz: "nedelja",
          datum: "2026-06-08",
          stomatolog: dentistId,
        }}
      />,
    );
    expect(jump).not.toContain('id="datum"');
    expect(jump).toContain(`href="/danas?prikaz=nedelja&amp;datum=${today}&amp;stomatolog=${dentistId}"`);
    expect(html).toContain(`href="/danas?prikaz=mesec&amp;datum=2026-06-08&amp;stomatolog=${dentistId}"`);
    expect(html).toContain('aria-label="Prethodna nedelja"');
    expect(html).toContain('aria-label="Sledeća nedelja"');
    expect(html).toContain(`href="/danas?prikaz=nedelja&amp;datum=2026-06-01&amp;stomatolog=${dentistId}"`);
    expect(html).toContain(`href="/danas?prikaz=nedelja&amp;datum=2026-06-15&amp;stomatolog=${dentistId}"`);
  });

  it("moves the month without sakrijOtkazane", async () => {
    const html = renderToStaticMarkup(
      await Page({
        searchParams: Promise.resolve({
          prikaz: "mesec",
          datum: "2026-06-08",
        }),
      }),
    );
    expect(html).not.toContain('id="datum"');
    expect(html).toContain('aria-label="Prethodni mesec"');
    expect(html).toContain('aria-label="Sledeći mesec"');
    expect(html).toContain('href="/danas?prikaz=mesec&amp;datum=2026-05-08"');
    expect(html).toContain('href="/danas?prikaz=mesec&amp;datum=2026-07-08"');
    expect(html).toContain(`href="/danas?prikaz=mesec&amp;datum=${today}"`);
    expect(html).not.toContain("Sakrij otkazane");
    expect(html).not.toContain("sakrijOtkazane");
  });
});

describe("clinic menu", () => {
  it("belongs on the clinic screens and not on the directory, a clinic page, or the platform", () => {
    expect(usesStaffShellMenu("/danas")).toBe(true);
    expect(usesStaffShellMenu("/danas/")).toBe(true);
    expect(usesStaffShellMenu("/pacijenti")).toBe(true);
    expect(usesStaffShellMenu("/zahtevi")).toBe(true);
    expect(usesStaffShellMenu("/podesavanja/nalog")).toBe(true);
    expect(usesStaffShellMenu("/statistika")).toBe(true);
    expect(usesStaffShellMenu("/")).toBe(false);
    expect(usesStaffShellMenu("/ordinacije/zubar")).toBe(false);
    expect(usesStaffShellMenu("/platforma")).toBe(false);
    expect(usesStaffShellMenu("/danasni")).toBe(false);
    expect(staffMenuItems("dentist").map((item) => item.label)).toEqual([
      "Kalendar",
      "Pacijenti",
      "Termini",
      "Podešavanja",
    ]);
    expect(staffMenuItems("owner").map((item) => item.href)).toContain("/statistika");
  });

  it("shows statistics only to the owner, plus sign-out", () => {
    nav.pathname = "/pacijenti";
    const dentist = renderToStaticMarkup(
      <TooltipProvider>
        <AppMenuClient role="dentist">
          <p>Sadržaj</p>
        </AppMenuClient>
      </TooltipProvider>,
    );
    expect(dentist).toContain("Kalendar");
    expect(dentist).toContain("Pacijenti");
    expect(dentist).toContain("Termini");
    expect(dentist.indexOf("Pacijenti")).toBeLessThan(dentist.indexOf('href="/zahtevi"'));
    expect(dentist.indexOf('href="/zahtevi"')).toBeLessThan(dentist.indexOf("Podešavanja"));
    expect(dentist).toContain("Podešavanja");
    expect(dentist).toContain("Odjava");
    expect(dentist).toContain("14:00");
    expect(dentist).toContain("petak, 23. oktobar 2026.");
    expect(dentist.indexOf("14:00")).toBeLessThan(dentist.indexOf("petak, 23. oktobar 2026."));
    expect(dentist).toContain("Sadržaj");
    expect(dentist).not.toContain("Statistika");
    expect(dentist).not.toContain("Imenik");
    expect(dentist).not.toContain("Platforma");

    nav.pathname = "/danas";
    const owner = renderToStaticMarkup(
      <TooltipProvider>
        <AppMenuClient role="owner">
          <p>Sadržaj</p>
        </AppMenuClient>
      </TooltipProvider>,
    );
    expect(owner).toContain('href="/statistika"');
    expect(owner).toContain("Odjava");
  });

  it("leaves the directory, the clinic page, and the platform without this menu", () => {
    for (const pathname of ["/", "/ordinacije/zubar", "/platforma"]) {
      nav.pathname = pathname;
      const html = renderToStaticMarkup(
        <AppMenuClient role="owner">
          <p>Sadržaj</p>
        </AppMenuClient>,
      );
      expect(html).toContain("Sadržaj");
      expect(html).not.toContain("Odjava");
      expect(html).not.toContain("Meni ordinacije");
    }
  });
});
