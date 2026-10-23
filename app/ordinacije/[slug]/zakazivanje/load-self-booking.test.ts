import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: createClient }));

import { bookingChildrenFrom, linkedIdsFrom, loadSelfBooking, profileFrom } from "./load-self-booking";

const selects: string[] = [];
const tables: string[] = [];
let linkData: unknown = false;
let linkError: { code?: string } | null = null;
let dependentRows: unknown = [];
let dependentError: { code?: string } | null = null;
let linkedData: unknown = [];
let linkedError: { code?: string } | null = null;
const rpcs: string[] = [];
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
  dependentRows = [];
  dependentError = null;
  linkedData = [];
  linkedError = null;
  rpcs.length = 0;
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
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const payload =
            table === "patient_dependents"
              ? { data: dependentRows, error: dependentError }
              : { data: null, error: { code: "unexpected-await" } };
          return Promise.resolve(payload).then(resolve, reject);
        },
      };
      return api;
    },
    rpc(name: string, args: { slug: string }) {
      rpcs.push(`${name}:${args.slug}`);
      if (name === "self_chart_linked") {
        rpcSlug = args.slug;
        return Promise.resolve({ data: linkData, error: linkError });
      }
      if (name === "linked_child_ids") {
        return Promise.resolve({ data: linkedData, error: linkedError });
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  });
});

describe("loadSelfBooking", () => {
  it("reads the account and whether this clinic link is their own chart", async () => {
    linkData = true;

    const loaded = await loadSelfBooking("account-1", "centar");

    expect(tables).toEqual(["patient_accounts", "patient_dependents"]);
    expect(selects).toEqual([
      "first_name, last_name, phone, email, date_of_birth",
      "id, first_name, last_name, date_of_birth, relationship",
    ]);
    expect(tables).not.toContain("patients");
    expect(tables).not.toContain("patient_chart_links");
    expect(rpcs).toEqual(["self_chart_linked:centar", "linked_child_ids:centar"]);
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
      children: [],
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

  it("does not treat a failed child-link read as no linked children", async () => {
    linkedError = { code: "42501" };

    const loaded = await loadSelfBooking("account-1", "centar");

    expect(loaded.status).toBe("unavailable");
  });

  it("marks only this clinic's children and drops a chart name and email", async () => {
    const mila = "22222222-2222-4222-8222-222222222222";
    const other = "33333333-3333-4333-8333-333333333333";
    dependentRows = [
      {
        id: mila,
        first_name: "Mila",
        last_name: "Milić",
        date_of_birth: "2020-04-01",
        relationship: "mother",
        email: "dete@example.com",
        chart_name: "Tuđi Karton",
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        first_name: "Luka",
        last_name: "Lukić",
        date_of_birth: "2018-02-02",
        relationship: "father",
      },
    ];
    linkedData = [mila, other];

    const loaded = await loadSelfBooking("account-1", "centar");

    expect(loaded).toMatchObject({
      status: "ready",
      children: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          firstName: "Luka",
          lastName: "Lukić",
          dateOfBirth: "2018-02-02",
          relationship: "father",
          linked: false,
        },
        {
          id: mila,
          firstName: "Mila",
          lastName: "Milić",
          dateOfBirth: "2020-04-01",
          relationship: "mother",
          linked: true,
        },
      ],
    });
    expect(JSON.stringify(loaded)).not.toContain("dete@example.com");
    expect(JSON.stringify(loaded)).not.toContain("Tuđi");
    expect(JSON.stringify(loaded)).not.toContain(other);
  });
});

describe("booking children", () => {
  it("rejects a linked-id payload that is not a list of ids", () => {
    expect(linkedIdsFrom("22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(linkedIdsFrom(["not-an-id"])).toBeNull();
    expect(bookingChildrenFrom([], new Set(["33333333-3333-4333-8333-333333333333"]))).toEqual([]);
  });
});

describe("profileFrom", () => {
  it("drops a row that is not an account profile", () => {
    expect(profileFrom({ first_name: "Ana", chart_name: "Tuđi Karton" })).toBeNull();
    expect(JSON.stringify(profileFrom(null))).not.toContain("Tuđi");
  });
});
