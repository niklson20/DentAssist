import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { belgradeLocalToISO, formatBelgrade } from "@/lib/calendar-dates";

vi.mock("next/navigation", () => ({
  usePathname: () => "/danas",
}));
vi.mock("@/app/actions/appointments", () => ({
  createAppointment: vi.fn(async () => null),
  updateAppointment: vi.fn(async () => null),
  createBlock: vi.fn(async () => null),
  sendOffer: vi.fn(async () => ({ ok: true, data: { id: "request" } })),
}));

import { sendOffer } from "@/app/actions/appointments";
import { CalendarShell } from "./calendar-shell";
import { OfferPicker, offerSelectionAfterTouch } from "./offer-picker";

const DAY = "2026-06-08";
const requestId = "44444444-4444-4444-8444-444444444444";

const pickerSource = readFileSync(path.join(process.cwd(), "app/danas/offer-picker.tsx"), "utf8");
const shellSource = readFileSync(path.join(process.cwd(), "app/danas/calendar-shell.tsx"), "utf8");

function at(hour: number, minute: number): string {
  return belgradeLocalToISO({ year: 2026, month: 6, day: 8, hour, minute });
}

function labelFor(value: string): string {
  return formatBelgrade(new Date(value), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function openingTag(html: string, label: string): string {
  const textAt = html.indexOf(label);
  const tagAt = html.lastIndexOf("<button", textAt);
  return html.slice(tagAt, textAt);
}

const requested = at(10, 0);
const requestedOffset = "2026-06-08T10:00:00+02:00";
const early = at(11, 0);
const mid = at(13, 0);
const late = at(15, 0);
const extra = at(16, 0);
const starts = [requested, requestedOffset, early, mid, late, extra];

describe("offer picker", () => {
  it("hides the requested hour on 2026-06-08 and does not send when nothing is chosen", () => {
    const html = renderToStaticMarkup(
      <OfferPicker
        requestId={requestId}
        requestedStart={requestedOffset}
        starts={starts}
        initialSelected={[requested]}
        onClose={() => undefined}
      />,
    );

    expect(requested).toContain(DAY);
    expect(early).toContain(DAY);
    expect(html).not.toContain(`data-start="${requested}"`);
    expect(html).not.toContain(`data-start="${requestedOffset}"`);
    expect(html).not.toContain(labelFor(requested));
    expect(html).toContain(`data-start="${early}"`);
    expect(html).toContain(labelFor(early));
    expect(html).not.toContain("Nema slobodnih termina ovog dana.");
    expect(openingTag(html, "Pošalji ponudu")).toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html.indexOf("Pošalji ponudu")).toBeLessThan(html.indexOf("</form>"));
    expect(html.indexOf("Nazad")).toBeGreaterThan(html.indexOf("</form>"));
    expect(openingTag(html, "Nazad")).toContain('type="button"');
    expect(sendOffer).not.toHaveBeenCalled();
    expect(pickerSource).toContain("onClick={onClose}");
    expect(pickerSource).toContain("ActionResult");
    expect(pickerSource.toLowerCase()).not.toContain("supabase");
    expect(pickerSource).not.toContain("#");
    expect(pickerSource).toContain("border-border");
    expect(pickerSource).toContain("bg-card");
    expect(pickerSource).toContain("text-destructive");
    expect(pickerSource).toContain("text-primary");
  });

  it("numbers up to three starts in the order they were added and enables send", () => {
    const chosen = offerSelectionAfterTouch([], late);
    const withEarly = offerSelectionAfterTouch(chosen, early);
    const withMid = offerSelectionAfterTouch(withEarly, mid);
    const stillThree = offerSelectionAfterTouch(withMid, extra);
    const withoutEarly = offerSelectionAfterTouch(stillThree, early);

    expect(withMid).toEqual([late, early, mid]);
    expect(stillThree).toEqual([late, early, mid]);
    expect(withoutEarly).toEqual([late, mid]);

    const html = renderToStaticMarkup(
      <OfferPicker
        requestId={requestId}
        requestedStart={requested}
        starts={starts}
        initialSelected={[late, early, mid]}
        onClose={() => undefined}
      />,
    );

    expect(html.slice(html.indexOf(`data-start="${late}"`), html.indexOf(`data-start="${late}"`) + 80)).toContain(
      'data-order="1"',
    );
    expect(html.slice(html.indexOf(`data-start="${early}"`), html.indexOf(`data-start="${early}"`) + 80)).toContain(
      'data-order="2"',
    );
    expect(html.slice(html.indexOf(`data-start="${mid}"`), html.indexOf(`data-start="${mid}"`) + 80)).toContain(
      'data-order="3"',
    );
    expect(html.slice(html.indexOf(labelFor(late)), html.indexOf(labelFor(late)) + 120)).toContain(">1<");
    expect(html.slice(html.indexOf(labelFor(early)), html.indexOf(labelFor(early)) + 120)).toContain(">2<");
    expect(html.slice(html.indexOf(labelFor(mid)), html.indexOf(labelFor(mid)) + 120)).toContain(">3<");
    expect(html.slice(html.indexOf(`data-start="${extra}"`), html.indexOf(`data-start="${extra}"`) + 40)).not.toContain(
      "data-order",
    );
    expect(html.indexOf(`name="pocetak" value="${late}"`)).toBeLessThan(html.indexOf(`name="pocetak" value="${early}"`));
    expect(html.indexOf(`name="pocetak" value="${early}"`)).toBeLessThan(html.indexOf(`name="pocetak" value="${mid}"`));
    expect(openingTag(html, "Pošalji ponudu")).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("stays off the calendar toolbar and does not send", () => {
    const html = renderToStaticMarkup(
      <CalendarShell query={{ prikaz: "dan", datum: DAY, stomatolog: null, sakrijOtkazane: true }} />,
    );

    expect(html).not.toContain("Ponudi");
    expect(html).not.toContain('aria-controls="ponuda"');
    expect(html).not.toContain('id="ponuda"');
    expect(html).not.toContain("Pošalji ponudu");
    expect(shellSource).not.toContain("setOfferOpen");
    expect(shellSource).not.toContain("<OfferPicker");
    expect(shellSource).not.toContain("sendOffer");
    expect(shellSource.toLowerCase()).not.toContain("supabase");
    expect(shellSource).not.toContain("#");
    expect(sendOffer).not.toHaveBeenCalled();
  });
});
