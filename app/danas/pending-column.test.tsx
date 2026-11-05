import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/appointments", () => ({
  acceptRequest: vi.fn(async () => ({ ok: true, data: { id: "appointment" } })),
  rejectRequest: vi.fn(async () => ({ ok: true, data: { id: "appointment" } })),
}));

import { PendingColumn, type PendingRequestView } from "./pending-column";

const columnSource = readFileSync(path.join(process.cwd(), "app/danas/pending-column.tsx"), "utf8");
const pageSource = readFileSync(path.join(process.cwd(), "app/zahtevi/page.tsx"), "utf8");
const calendarSource = readFileSync(path.join(process.cwd(), "app/danas/page.tsx"), "utf8");

const request: PendingRequestView = {
  id: "44444444-4444-4444-8444-444444444444",
  timeLabel: "10:00",
  name: "Ana Anić",
  dentistName: "Mina Minić",
  reason: "Kontrola",
  deadlineLabel: "24. okt, 10:00",
  needsChoice: false,
};

function column(role: "owner" | "dentist" | "reception", item: PendingRequestView = request) {
  return renderToStaticMarkup(<PendingColumn role={role} requests={[item]} />);
}

describe("pending column", () => {
  it("shows the request and lets the owner accept or reject", () => {
    const html = column("owner");

    expect(html).toContain("Na čekanju");
    expect(html).toContain("10:00");
    expect(html).toContain("Ana Anić");
    expect(html).toContain("Stomatolog");
    expect(html).toContain("Mina Minić");
    expect(html).toContain("Razlog");
    expect(html).toContain("Kontrola");
    expect(html).toContain("Odgovor do");
    expect(html).toContain("24. okt, 10:00");
    expect(html).toContain("Poruka pacijentu");
    expect(html).toContain("Prihvati");
    expect(html).toContain("Odbij");
    expect(html).toContain('name="odluka" value="prihvati"');
    expect(html).toContain('name="zahtev" value="44444444-4444-4444-8444-444444444444"');
    expect(html).toContain('maxLength="300"');
    expect(html).not.toContain("Ponudi");
    expect(html).not.toContain("Isti karton");
  });

  it("lets the assigned dentist respond", () => {
    const html = column("dentist");

    expect(html).toContain("Prihvati");
    expect(html).toContain("Odbij");
    expect(html).not.toContain("Ponudi");
  });

  it("shows reception who is coming without accept, reject, or offer", () => {
    const html = column("reception");

    expect(html).toContain("Ana Anić");
    expect(html).toContain("Mina Minić");
    expect(html).toContain("Kontrola");
    expect(html).not.toContain("Prihvati");
    expect(html).not.toContain("Odbij");
    expect(html).not.toContain("Ponudi");
    expect(html).not.toContain("Isti karton");
    expect(html).not.toContain("Drugi pacijent");
  });

  it("stops a foreign email at chart choice and does not show the other name", () => {
    const html = column("owner", { ...request, needsChoice: true });

    expect(html).toContain("Isti karton");
    expect(html).toContain("Drugi pacijent");
    expect(html).toContain('name="odluka" value="isti"');
    expect(html).toContain('name="odluka" value="drugi"');
    expect(html).toContain("Ana Anić");
    expect(html).not.toContain('value="prihvati"');
    expect(html).not.toContain("Milan");
    expect(html).not.toContain("Marković");
    expect(html).not.toContain("Ponudi");
  });

  it("keeps the page and the column off Supabase", () => {
    expect(pageSource).toContain("PendingColumn");
    expect(pageSource).toContain("loadPendingRequests");
    expect(pageSource).toContain("Zahtevi");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(calendarSource).not.toContain("PendingColumn");
    expect(calendarSource).not.toContain("loadPendingRequests");
    expect(columnSource.toLowerCase()).not.toContain("supabase");
    expect(columnSource).toContain("ActionResult");
    expect(columnSource).toContain("border-border");
    expect(columnSource).toContain("bg-card");
    expect(columnSource).toContain("text-muted-foreground");
    expect(columnSource).toContain("text-destructive");
    expect(columnSource).not.toContain("Ponudi");
  });
});
