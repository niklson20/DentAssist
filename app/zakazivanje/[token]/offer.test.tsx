import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashInviteToken } from "@/lib/clinic-invite";

import { chooseOffer, declineOffers } from "./actions";
import Page from "./page";
import { formatOfferWhen, invalidOfferLinkText, LINK_INVALID } from "./schema";

const { requirePatient, createClient, revalidatePath } = vi.hoisted(() => ({
  requirePatient: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePatient }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

const token = "raw-offer-token";
const phone = "+38111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const third = "44444444-4444-4444-8444-444444444444";
const fourth = "55555555-5555-4555-8555-555555555555";
const foreign = "66666666-6666-4666-8666-666666666666";
const previousPepper = process.env.TOKEN_PEPPER;

function offer(id: string, startsAt: string, endsAt: string, firstName: string, lastName: string) {
  return {
    id,
    starts_at: startsAt,
    ends_at: endsAt,
    dentist_first_name: firstName,
    dentist_last_name: lastName,
  };
}

const readyOffers = [
  offer(first, "2026-10-22T07:30:00.000Z", "2026-10-22T08:00:00.000Z", "Mina", "Minić"),
  offer(second, "2026-10-22T09:00:00.000Z", "2026-10-22T09:30:00.000Z", "Mina", "Minić"),
  offer(third, "2026-10-22T10:30:00.000Z", "2026-10-22T11:00:00.000Z", "Mina", "Minić"),
  offer(fourth, "2026-10-22T12:00:00.000Z", "2026-10-22T12:30:00.000Z", "Tajna", "Tajnić"),
];

const readyPreview = {
  status: "ready",
  slug: "centar",
  clinic_name: "Ordinacija Centar",
  phone,
  patient_first_name: "Tajna",
  offers: [
    ...readyOffers,
    {
      id: "not-an-id",
      starts_at: "2026-10-22T13:00:00.000Z",
      ends_at: "2026-10-22T13:30:00.000Z",
      dentist_first_name: "Skriveno",
      dentist_last_name: "Ime",
    },
  ],
};

function mockRpc(preview: unknown, write?: { data: unknown; error: { message?: string; code?: string } | null }) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "preview_booking_offer") {
      return { data: preview, error: null };
    }
    return write ?? { data: null, error: null };
  });
  createClient.mockResolvedValue({ rpc });
  return rpc;
}

function posted(offerId?: string) {
  const data = new FormData();
  data.set("token", token);
  if (offerId) {
    data.set("offerId", offerId);
  }
  return data;
}

async function renderOffer() {
  return renderToStaticMarkup(await awaitPage());
}

function awaitPage() {
  return Page({ params: Promise.resolve({ token }) });
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

describe("offer page", () => {
  it("keeps supabase out of the page and the form", () => {
    const pageSource = readFileSync(path.join(process.cwd(), "app/zakazivanje/[token]/page.tsx"), "utf8");
    const formSource = readFileSync(path.join(process.cwd(), "app/zakazivanje/[token]/offer-form.tsx"), "utf8");
    expect(pageSource.toLowerCase()).not.toContain("supabase");
    expect(formSource.toLowerCase()).not.toContain("supabase");
    expect(pageSource).toContain('purpose: "request"');
    expect(`${pageSource}\n${formSource}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("shows at most three offered times to the matching account", async () => {
    mockRpc(readyPreview);
    const html = await renderOffer();

    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(html).toContain("Ponuda termina");
    expect(html).toContain("Ordinacija Centar");
    expect(html).toContain("Potvrdi");
    expect(html).toContain("Nijedan ne odgovara");
    expect(html).toContain(formatOfferWhen(readyOffers[0].starts_at, readyOffers[0].ends_at));
    expect(html).toContain(formatOfferWhen(readyOffers[2].starts_at, readyOffers[2].ends_at));
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).not.toContain(fourth);
    expect(html).not.toContain("Tajna");
    expect(html).not.toContain("Skriveno");
    expect(html).not.toContain(hashInviteToken(token, "pepper"));
    expect(html).toContain('name="token"');
  });

  it("does not let another account choose an offer", async () => {
    mockRpc({ status: "mismatch", slug: "centar", phone });
    const html = await renderOffer();

    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(html).toContain(invalidOfferLinkText(phone));
    expect(html).not.toContain("Potvrdi");
    expect(html).not.toContain("Nijedan ne odgovara");
    expect(html).not.toContain("Mina");
  });

  it("does not let a signed-out visitor choose an offer", async () => {
    mockRpc({ status: "signed_out", slug: "centar" });
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/prijava"));

    await expect(awaitPage()).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
  });

  it("sends an unconfirmed email to registration before a choice", async () => {
    mockRpc({ status: "unconfirmed", slug: "centar" });
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/registracija"));

    await expect(awaitPage()).rejects.toThrow("REDIRECT:/ordinacije/centar/registracija");
    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
  });
});

describe("offer actions", () => {
  it("confirms one offered slot for the matching account", async () => {
    const rpc = mockRpc(readyPreview, { data: first, error: null });

    const result = await chooseOffer(null, posted(first));

    expect(result).toEqual({ ok: true, data: { status: "scheduled" } });
    expect(requirePatient).toHaveBeenCalledWith({ purpose: "request", slug: "centar" });
    expect(rpc).toHaveBeenCalledWith("choose_offer", {
      token: hashInviteToken(token, "pepper"),
      offer_id: first,
    });
    expect(rpc.mock.calls.some((call) => call[1]?.token === token)).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith(`/zakazivanje/${token}`);
  });

  it("declines every offered slot for the matching account", async () => {
    const rpc = mockRpc(readyPreview, { data: null, error: null });

    const result = await declineOffers(null, posted());

    expect(result).toEqual({ ok: true, data: { status: "declined" } });
    expect(rpc).toHaveBeenCalledWith("decline_offers", {
      token: hashInviteToken(token, "pepper"),
    });
  });

  it("does not confirm an offer for another account", async () => {
    const rpc = mockRpc({ status: "mismatch", slug: "centar", phone });

    const result = await chooseOffer(null, posted(first));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(invalidOfferLinkText(phone));
    }
    expect(rpc).not.toHaveBeenCalledWith("choose_offer", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("decline_offers", expect.anything());
  });

  it("does not decline an offer for another account", async () => {
    const rpc = mockRpc({ status: "mismatch", slug: "centar", phone });

    const result = await declineOffers(null, posted());

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalledWith("decline_offers", expect.anything());
  });

  it("does not confirm an offer when nobody is signed in", async () => {
    const rpc = mockRpc({ status: "signed_out", slug: "centar" });
    requirePatient.mockRejectedValue(new Error("REDIRECT:/ordinacije/centar/prijava"));

    await expect(chooseOffer(null, posted(first))).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
    await expect(declineOffers(null, posted())).rejects.toThrow("REDIRECT:/ordinacije/centar/prijava");
    expect(rpc).not.toHaveBeenCalledWith("choose_offer", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("decline_offers", expect.anything());
  });

  it("does not confirm a slot that was not offered", async () => {
    const rpc = mockRpc(readyPreview);

    const result = await chooseOffer(null, posted(foreign));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Izaberite jedan od ponuđenih termina.");
    }
    expect(rpc).not.toHaveBeenCalledWith("choose_offer", expect.anything());
  });

  it("does not treat a rejected choice as success", async () => {
    mockRpc(readyPreview, {
      data: null,
      error: { message: "booking link does not match this account", code: "P0001" },
    });

    const result = await chooseOffer(null, posted(first));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(invalidOfferLinkText(phone));
    }
  });
});

describe("preview_booking_offer", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261029150000_preview_booking_offer.sql"),
    "utf8",
  );

  function functionBody(name: string): string {
    const start = sql.indexOf(`function public.${name}`);
    const open = sql.indexOf("as $$", start);
    const close = sql.indexOf("$$;", open);
    return sql.slice(open, close).toLowerCase();
  }

  it("returns slots only for the signed-in request email, and at most three", () => {
    const body = functionBody("preview_booking_offer");
    const slots = body.indexOf("appointment_offers");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("from public.patient_accounts as account");
    expect(body).toContain("account.user_id = auth.uid()");
    expect(body).toContain("account.email_confirmed_at");
    expect(body).toContain("v_request.account_id = v_account_id");
    expect(body).toContain("lower(v_request.booker_email) = lower(v_email)");
    expect(body).toContain("link.purpose = 'offer'");
    expect(body).toContain("appointment.status = 'offered'");
    expect(body).toContain("limit 3");
    expect(body.indexOf("'signed_out'")).toBeGreaterThan(-1);
    expect(body.indexOf("'mismatch'")).toBeGreaterThan(-1);
    expect(slots).toBeGreaterThan(body.indexOf("'signed_out'"));
    expect(slots).toBeGreaterThan(body.indexOf("'mismatch'"));
    expect(body).not.toContain("'booker_email'");
    expect(body).not.toContain("patient_first_name");
    expect(body).not.toContain("from public.patients");
    expect(body).not.toMatch(/\breason\b/);
    expect(body).not.toMatch(/\bjmbg\b/);

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("grant execute on function public.preview_booking_offer(text) to anon, authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.preview_booking_offer\(text\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.preview_booking_offer\(text\) to public/);
  });
});

describe("unknown offer link", () => {
  it("shows the invalid text and no choice", async () => {
    mockRpc({ status: "invalid" });
    const html = await renderOffer();

    expect(html).toContain(LINK_INVALID);
    expect(html).not.toContain("Potvrdi");
    expect(html).not.toContain("Nijedan ne odgovara");
    expect(requirePatient).not.toHaveBeenCalled();
  });
});
