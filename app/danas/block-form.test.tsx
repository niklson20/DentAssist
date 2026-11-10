import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/danas",
}));
vi.mock("@phosphor-icons/react", () => {
  const Icon = () => null;
  return {
    CalendarBlank: Icon,
    CaretDown: Icon,
    ChartBar: Icon,
    ClipboardText: Icon,
    Gear: Icon,
    PencilSimple: Icon,
    SignOut: Icon,
    SidebarIcon: Icon,
    Tooth: Icon,
    Users: Icon,
    XIcon: Icon,
  };
});
vi.mock("@/app/actions/appointments", () => ({
  createAppointment: vi.fn(async () => null),
  createBlock: vi.fn(async () => null),
}));

import { BlockForm } from "./block-form";
import { CalendarShell } from "./calendar-shell";

const dentistId = "22222222-2222-4222-8222-222222222222";
const DAY = "2026-06-08";

const formSource = readFileSync(path.join(process.cwd(), "app/danas/block-form.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");

describe("block form", () => {
  it("keeps the dentist and day from the calendar on 2026-06-08", () => {
    const html = renderToStaticMarkup(
      <BlockForm datum={DAY} dentistId={dentistId} dentistLabel="Mina Minić" />,
    );
    expect(html).toContain(`name="stomatolog" value="${dentistId}"`);
    expect(html).toContain(`name="datum" value="${DAY}"`);
    expect(html).toContain("Blokada");
    expect(html).toContain("Početak");
    expect(html).toContain("Kraj");
    expect(html).toContain("Razlog");
    expect(html).toContain('name="pocetak"');
    expect(html).toContain('name="kraj"');
    expect(html).toContain("Mina Minić");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(formSource).not.toContain("#");
    expect(formSource).toContain("ActionResult");
    expect(formSource).toContain("text-destructive");
    expect(formSource).toContain("border-border");
    expect(formSource).toContain("bg-card");
  });

  it("stays off the calendar toolbar", () => {
    const html = renderToStaticMarkup(
      <CalendarShell
        query={{ prikaz: "dan", datum: DAY, stomatolog: dentistId }}
      />,
    );
    expect(html).not.toContain("Nova blokada");
    expect(html).not.toContain('aria-controls="nova-blokada"');
    expect(shellSource).not.toContain("setBlockOpen");
    expect(shellSource).not.toContain("<BlockForm");
    expect(shellSource.toLowerCase()).not.toContain("supabase");
  });
});
