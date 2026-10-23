import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));

import { loadSelfBooking, profileFrom } from "./load-self-booking";

const selects: string[] = [];
const tables: string[] = [];
let linkData: unknown = false;
let linkError: { code?: string } | null = null;
let accountData: unknown = {
  first_name: "Ana",
  last_name: "Anić",
  phone: "+38160111222",
  email: "ana@example.com",
  date_of_birth: "1990-01-01",
  chart_name: "Tuđi Karton",
};
let accountError: { code?: string } | null = null;
let rpcSlug = "";

beforeEach(() => {
  selects.length = 0;
  tables.length = 0;
  linkData = false;
  linkError = null;
  accountError = null;
  rpcSlug = "";
  accountData = {
    first_name: "Ana",
    last_name: "Anić",
    phone: "+38160111222",
    email: "ana@example.com",
    date_of_birth: "1990-01-01",
    chart_name: "Tuđi Karton",
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  createClient.mockResolvedValue({
    from(table: string) {
      tables.push(table);
      const api = {
        select(columns: string) {
          selects.push(columns);
          return api;
        },
        eq() {
          return api;
        },
        maybeSingle: async () => ({ data: accountData, error: accountError }),
      };
      return api;
    },
    rpc(name: string, args: { slug: string }) {
      if (name !== "self_chart_linked") {
        throw new Error(`unexpected rpc ${name}`);
      }
      rpcSlug = args.slug;
      return Promise.resolve({ data: linkData, error: linkError });
    },
  });
});

describe("loadSelfBooking", () => {
  it("reads the account and whether this clinic link is their own chart", async () => {
    linkData = true;

    const loaded = await loadSelfBooking("account-1", "centar");

    expect(tables).toEqual(["patient_accounts"]);
    expect(selects).toEqual(["first_name, last_name, phone, email, date_of_birth"]);
    expect(rpcSlug).toBe("centar");
    expect(loaded).toEqual({
      status: "ready",
      selfLinked: true,
      profile: {
        firstName: "Ana",
        lastName: "Anić",
        phone: "+38160111222",
        email: "ana@example.com",
        dateOfBirth: "1990-01-01",
      },
    });
    expect(JSON.stringify(loaded)).not.toContain("Tuđi");
  });

  it("keeps the form when this clinic has no self link", async () => {
    linkData = false;

    const loaded = await loadSelfBooking("account-1", "druga");

    expect(rpcSlug).toBe("druga");
    expect(loaded).toMatchObject({ status: "ready", selfLinked: false });
  });

  it("does not treat a failed link read as unlinked", async () => {
    linkError = { code: "42501" };

    const loaded = await loadSelfBooking("account-1", "centar");

    expect(loaded).toEqual({
      status: "unavailable",
      message: "Zakazivanje trenutno nije dostupno. Pokušajte ponovo.",
    });
  });
});

describe("profileFrom", () => {
  it("drops a row that is not an account profile", () => {
    expect(profileFrom({ first_name: "Ana", chart_name: "Tuđi Karton" })).toBeNull();
    expect(JSON.stringify(profileFrom(null))).not.toContain("Tuđi");
  });
});
