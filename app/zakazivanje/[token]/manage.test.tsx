import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { formatBelgradeDate } from "@/lib/calendar-dates";
import { hashInviteToken } from "@/lib/clinic-invite";

import { cancelAppointment, loadManageSlots, rescheduleAppointment } from "./actions";
import { parseManagePreview } from "./load-manage";
import Page from "./page";
import {
  ALREADY_MOVED,
  formatManageTime,
  formatOfferWhen,
  invalidOfferLinkText,
  LINK_INVALID,
  PICK_SLOT,
  tooLateText,
} from "./schema";

const { requirePatient, createClient, revalidatePath } = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePatient }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const token = "raw-manage-token";
const phone = "+38111111111";
const currentStart = "2026-11-02T08:00:00.000Z";
const currentEnd = "2026-11-02T08:30:00.000Z";
const freeStart = "2026-11-02T10:00:00.000Z";
const freeEnd = "2026-11-02T10:30:00.000Z";
const day = formatBelgradeDate(new Date(freeStart));
const secretEmail = "tajna-adresa@example.com";
const previousPepper = process.env.TOKEN_PEPPER;

const readyManage = {
  status: "ready",
  slug: "centar",
  clinic_name: "Ordinacija Centar",
  phone,
  starts_at: currentStart,
  ends_at: currentEnd,
  dentist_first_name: "Mina",
  dentist_last_name: "Minić",
  can_reschedule: true,
  today: "2026-10-23",
  max_ahead_days: 14,
  day,
  slots: [
    { starts_at: currentStart, ends_at: currentEnd },
    { starts_at: freeStart, ends_at: freeEnd },
    { starts_at: "not-a-time", ends_at: freeEnd },
  ],
  patient_first_name: "Tajna",
  booker_email: secretEmail,
  jmbg: "1234567890123",
};

function mockRpc(options: {
  offer?: unknown;
  manage?: unknown;
  write?: { data: unknown; error: { message?: string; code?: string } | null };
} = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "preview_booking_offer") {
      return { data: options.offer ?? { status: "invalid" }, error: null };
    }
    if (name === "preview_booking_manage") {
      return { data: options.manage ?? { status: "invalid" }, error: null };
    }
    return options.write ?? { data: null, error: null };
  });
  createClient.mockResolvedValue({ rpc });
  return rpc;
}

function posted(startsAt?: string) {
  const data = new FormData();
  data.set("token", token);
  if (startsAt !== undefined) {
    data.set("startsAt", startsAt);
  }
  return data;
}

function awaitPage() {
  return Page({ params: Promise.resolve({ token }) });
}

async function renderManage() {
  return renderToStaticMarkup(await awaitPage());
}

beforeEach(() => {
  process.env.TOKEN_PEPPER = "pepper";
  requirePatient.mockReset();
  createClient.mockReset();
  revalidatePath.mockReset();
  requirePatient.mockResolvedValue({
    userId: "user-1",
    accountId: "account-1",
    email: "ana@example.com",
    emailConfirmedAt: "2026-10-22T10:00:00.000Z",
  });
});

afterAll(() => {
  if (previousPepper === undefined) {
    delete process.env.TOKEN_PEPPER;
  } else {
    process.env.TOKEN_PEPPER = previousPepper;
  }
});

describe("manage page", () => {
  it("keeps supabase out of the page and the form", () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/zakazivanje/[token]/page.tsx"), "utf8");
    const formSource = readFileSync(path.join(process.cwd(), "app/zakazivanje/[token]/manage-form.tsx"), "utf8");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).toContain('purpose: "request"');
    expect(`${pageSource}\n${formSource}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("lets the matching account move or cancel more than 24 hours ahead", async () => {
    mockRpc({ manage: readyManage });
    const html = await renderManage();

    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(html).toContain("Termin");
    expect(html).toContain("Ordinacija Centar");
    expect(html).toContain(formatOfferWhen(currentStart, currentEnd));
    expect(html).toContain("Stomatolog Mina Minić");
    expect(html).toContain(formatManageTime(freeStart));
    expect(html).toContain("Pomeri termin");
    expect(html).toContain("Otkaži termin");
    expect(html).not.toContain("Potvrdi");
    expect(html).not.toContain("Tajna");
    expect(html).not.toContain(secretEmail);
    expect(html).not.toContain("1234567890123");
    expect(html).not.toContain(hashInviteToken(token, "pepper"));
  });

  it("shows only the clinic phone when fewer than 24 hours remain", async () => {
    mockRpc({
      manage: {
        status: "too_late",
        slug: "centar",
        clinic_name: "Ordinacija Centar",
        phone,
        starts_at: currentStart,
        ends_at: currentEnd,
        dentist_first_name: "Mina",
        dentist_last_name: "Minić",
      },
    });
    const html = await renderManage();

    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(html).toContain(tooLateText(phone));
    expect(html).toContain(phone);
    expect(html).not.toContain("Pomeri termin");
    expect(html).not.toContain("Otkaži termin");
    expect(html).not.toContain(formatManageTime(freeStart));
  });

  it("hides the move after the one reschedule is used", async () => {
    mockRpc({
      manage: {
        ...readyManage,
        can_reschedule: false,
        slots: [{ starts_at: freeStart, ends_at: freeEnd }],
      },
    });
    const html = await renderManage();

    expect(html).toContain(ALREADY_MOVED);
    expect(html).toContain("Otkaži termin");
    expect(html).not.toContain("Pomeri termin");
    expect(html).not.toContain(formatManageTime(freeStart));
  });

  it("does not let another account move or cancel", async () => {
    mockRpc({ manage: { status: "mismatch", slug: "centar", phone, dentist_first_name: "Mina" } });
    const html = await renderManage();

    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(html).toContain(invalidOfferLinkText(phone));
    expect(html).not.toContain("Pomeri termin");
    expect(html).not.toContain("Otkaži termin");
    expect(html).not.toContain("Mina");
  });

  it("sends a signed-out visitor to login before a change", async () => {
    mockRpc({ manage: { status: "signed_out", slug: "centar", starts_at: freeStart } });
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/prijava"));

    await expect(awaitPage()).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
  });

  it("sends an unconfirmed email to registration before a change", async () => {
    mockRpc({ manage: { status: "unconfirmed", slug: "centar" } });
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/registracija"));

    await expect(awaitPage()).rejects.toThrow("REDIRECT:/ordinacije/centar/registracija");
  });

  it("shows the invalid text when the clinic is unknown", async () => {
    mockRpc({ manage: { status: "invalid" } });
    const html = await renderManage();

    expect(html).toContain(LINK_INVALID);
    expect(html).not.toContain("Pomeri termin");
    expect(html).not.toContain("Otkaži termin");
    expect(requirePatient).not.toHaveBeenCalled();
  });

  it("shows the clinic phone when the link is dead and the clinic is known", async () => {
    mockRpc({ manage: { status: "invalid", slug: "centar", phone } });
    const html = await renderManage();

    expect(html).toContain(invalidOfferLinkText(phone));
    expect(html).not.toContain("Pomeri termin");
    expect(requirePatient).not.toHaveBeenCalled();
  });

  it("does not treat an offer link as a manage link", async () => {
    const rpc = mockRpc({
      offer: { status: "invalid", slug: "centar", phone },
      manage: readyManage,
    });
    const html = await renderManage();

    expect(html).toContain(invalidOfferLinkText(phone));
    expect(html).not.toContain("Pomeri termin");
    expect(rpc).not.toHaveBeenCalledWith("preview_booking_manage", expect.anything());
  });
});

describe("manage actions", () => {
  it("moves the appointment once for the matching account", async () => {
    const rpc = mockRpc({ manage: readyManage, write: { data: null, error: null } });

    const result = await rescheduleAppointment(null, posted(freeStart));

    expect(result).toEqual({ ok: true, data: { status: "rescheduled" } });
    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(rpc).toHaveBeenCalledWith("reschedule_by_token", {
      token: hashInviteToken(token, "pepper"),
      starts_at: freeStart,
    });
    expect(
      (rpc.mock.calls as unknown as [string, { token?: string } | undefined][]).some(
        (call) => call[1]?.token === token,
      ),
    ).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith(`/zakazivanje/${token}`);
  });

  it("cancels for the matching account while more than 24 hours remain", async () => {
    const rpc = mockRpc({ manage: readyManage, write: { data: null, error: null } });

    const result = await cancelAppointment(null, posted());

    expect(result).toEqual({ ok: true, data: { status: "cancelled" } });
    expect(rpc).toHaveBeenCalledWith("cancel_by_token", {
      token: hashInviteToken(token, "pepper"),
    });
    expect(rpc).toHaveBeenCalledWith("preview_booking_manage", {
      p_token_hash: hashInviteToken(token, "pepper"),
      p_day: null,
    });
  });

  it("does not move or cancel for another account", async () => {
    const rpc = mockRpc({ manage: { status: "mismatch", slug: "centar", phone } });

    const moved = await rescheduleAppointment(null, posted(freeStart));
    const cancelled = await cancelAppointment(null, posted());

    expect(moved.ok).toBe(false);
    expect(cancelled.ok).toBe(false);
    if (!moved.ok) {
      expect(moved.error).toBe(invalidOfferLinkText(phone));
    }
    expect(rpc).not.toHaveBeenCalledWith("reschedule_by_token", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("cancel_by_token", expect.anything());
  });

  it("does not move or cancel when nobody is signed in", async () => {
    const rpc = mockRpc({ manage: { status: "signed_out", slug: "centar" } });
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/prijava"));

    await expect(rescheduleAppointment(null, posted(freeStart))).rejects.toThrow(
      "REDIRECT:/ordinacije/centar/prijava",
    );
    await expect(cancelAppointment(null, posted())).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
    expect(rpc).not.toHaveBeenCalledWith("reschedule_by_token", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("cancel_by_token", expect.anything());
  });

  it("does not move or cancel inside the last 24 hours", async () => {
    const rpc = mockRpc({
      manage: {
        status: "too_late",
        slug: "centar",
        clinic_name: "Ordinacija Centar",
        phone,
        starts_at: currentStart,
        ends_at: currentEnd,
        dentist_first_name: "Mina",
        dentist_last_name: "Minić",
      },
    });

    const moved = await rescheduleAppointment(null, posted(freeStart));
    const cancelled = await cancelAppointment(null, posted());

    expect(moved.ok).toBe(false);
    expect(cancelled.ok).toBe(false);
    if (!moved.ok && !cancelled.ok) {
      expect(moved.error).toBe(tooLateText(phone));
      expect(cancelled.error).toBe(tooLateText(phone));
    }
    expect(rpc).not.toHaveBeenCalledWith("reschedule_by_token", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("cancel_by_token", expect.anything());
  });

  it("does not move a second time, and still cancels", async () => {
    const rpc = mockRpc({
      manage: { ...readyManage, can_reschedule: false },
      write: { data: null, error: null },
    });

    const moved = await rescheduleAppointment(null, posted(freeStart));
    const cancelled = await cancelAppointment(null, posted());

    expect(moved.ok).toBe(false);
    if (!moved.ok) {
      expect(moved.error).toBe(ALREADY_MOVED);
    }
    expect(cancelled).toEqual({ ok: true, data: { status: "cancelled" } });
    expect(rpc).not.toHaveBeenCalledWith("reschedule_by_token", expect.anything());
    expect(rpc).toHaveBeenCalledWith("cancel_by_token", {
      token: hashInviteToken(token, "pepper"),
    });
  });

  it("does not move onto the current start or a start that was not free", async () => {
    const rpc = mockRpc({ manage: readyManage });

    const sameStart = await rescheduleAppointment(null, posted(currentStart));
    const otherDay = await rescheduleAppointment(null, posted("2026-11-03T10:00:00.000Z"));

    expect(sameStart.ok).toBe(false);
    expect(otherDay.ok).toBe(false);
    if (!sameStart.ok && !otherDay.ok) {
      expect(sameStart.error).toBe(PICK_SLOT);
      expect(otherDay.error).toBe(PICK_SLOT);
    }
    expect(rpc).not.toHaveBeenCalledWith("reschedule_by_token", expect.anything());
  });

  it("does not treat a rejected move as success", async () => {
    mockRpc({
      manage: readyManage,
      write: { data: null, error: { message: "booking link does not match this account", code: "P0001" } },
    });

    const result = await rescheduleAppointment(null, posted(freeStart));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(invalidOfferLinkText(phone));
    }
  });

  it("turns a late database rejection into the clinic phone", async () => {
    mockRpc({
      manage: readyManage,
      write: { data: null, error: { message: "appointment can no longer be cancelled", code: "P0001" } },
    });

    const result = await cancelAppointment(null, posted());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(tooLateText(phone));
    }
  });

  it("returns free starts only for the matching account", async () => {
    mockRpc({ manage: readyManage });

    const result = await loadManageSlots(token, day);

    expect(result).toEqual({
      ok: true,
      data: { slots: [{ startsAt: freeStart, endsAt: freeEnd }] },
    });
  });

  it("does not return starts to another account", async () => {
    const rpc = mockRpc({ manage: { status: "mismatch", slug: "centar", phone } });

    const result = await loadManageSlots(token, day);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(invalidOfferLinkText(phone));
      expect(result.error).not.toContain(freeStart);
    }
    expect(rpc).not.toHaveBeenCalledWith("reschedule_by_token", expect.anything());
  });
});

describe("parse manage preview", () => {
  it("drops the current start and private fields", () => {
    const preview = parseManagePreview(readyManage);

    expect(preview.status).toBe("ready");
    if (preview.status === "ready") {
      expect(preview.slots).toEqual([{ startsAt: freeStart, endsAt: freeEnd }]);
      expect(preview).not.toHaveProperty("patient_first_name");
      expect(preview).not.toHaveProperty("booker_email");
    }
  });
});

describe("preview_booking_manage", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261029160000_preview_booking_manage.sql"),
    "utf8",
  );

  function functionBody(name: string): string {
    const start = sql.indexOf(`function public.${name}`);
    const open = sql.indexOf("as $$", start);
    const close = sql.indexOf("$$;", open);
    return sql.slice(open, close).toLowerCase();
  }

  it("returns times only for the signed-in request email, and only while more than 24 hours remain", () => {
    const body = functionBody("preview_booking_manage");
    const slots = body.indexOf("private.reschedule_slot_is_open");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("from public.patient_accounts as account");
    expect(body).toContain("account.user_id = auth.uid()");
    expect(body).toContain("account.email_confirmed_at");
    expect(body).toContain("v_request.account_id = v_account_id");
    expect(body).toContain("lower(v_request.booker_email) = lower(v_email)");
    expect(body).toContain("link.purpose = 'manage'");
    expect(body).toContain("appointment.status = 'scheduled'");
    expect(body).toContain("interval '24 hours'");
    expect(body).toContain("patient_reschedule_count");
    expect(body.indexOf("'signed_out'")).toBeGreaterThan(-1);
    expect(body.indexOf("'mismatch'")).toBeGreaterThan(-1);
    expect(body.indexOf("'too_late'")).toBeGreaterThan(-1);
    expect(slots).toBeGreaterThan(body.indexOf("'signed_out'"));
    expect(slots).toBeGreaterThan(body.indexOf("'mismatch'"));
    expect(slots).toBeGreaterThan(body.indexOf("interval '24 hours'"));
    expect(body.indexOf("patient_reschedule_count")).toBeLessThan(slots);
    expect(body).not.toContain("'booker_email'");
    expect(body).not.toContain("patient_first_name");
    expect(body).not.toContain("from public.patients");
    expect(body).not.toMatch(/\breason\b/);
    expect(body).not.toMatch(/\bjmbg\b/);

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain(
      "grant execute on function public.preview_booking_manage(text, date) to anon, authenticated",
    );
    expect(sql).not.toMatch(/grant execute on function public\.preview_booking_manage\(text, date\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.preview_booking_manage\(text, date\) to public/);
  });
});
