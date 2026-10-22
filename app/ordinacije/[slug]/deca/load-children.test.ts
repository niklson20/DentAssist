import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createClient,
}));

import { childrenFrom, loadAccountChildren } from "./load-children";

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  createClient.mockReset();
  createClient.mockResolvedValue({
    from(table: string) {
      calls.push(table);
      if (table !== "patient_dependents") {
        throw new Error(`unexpected table ${table}`);
      }
      const result = {
        data: [
          {
            id: "child-1",
            first_name: "Ana",
            last_name: "Anić",
            date_of_birth: "2018-03-02",
            relationship: "mother",
          },
        ],
        error: null,
      };
      const api = {
        select: () => api,
        eq: () => api,
        order: () => api,
        then: (onFulfilled: (value: typeof result) => unknown) => Promise.resolve(result).then(onFulfilled),
      };
      return api;
    },
  });
});

describe("loadAccountChildren", () => {
  it("reads only children on the account, not an unconfirmed chart", async () => {
    const loaded = await loadAccountChildren("account-1");
    expect(calls).toEqual(["patient_dependents"]);
    expect(loaded).toEqual({
      status: "ready",
      children: [
        {
          id: "child-1",
          firstName: "Ana",
          lastName: "Anić",
          dateOfBirth: "2018-03-02",
          relationship: "mother",
        },
      ],
    });
    expect(JSON.stringify(loaded)).not.toContain("Mika");
  });

  it("sorts the account list and drops a row without a relationship", () => {
    const children = childrenFrom([
      {
        id: "2",
        first_name: "Zoe",
        last_name: "Zorić",
        date_of_birth: "2019-01-01",
        relationship: "father",
        chart_name: "Mika Mikić",
      },
      {
        id: "1",
        first_name: "Ana",
        last_name: "Anić",
        date_of_birth: "2018-03-02",
        relationship: "mother",
      },
      {
        id: "3",
        first_name: "Mika",
        last_name: "Mikić",
        date_of_birth: "2016-05-04",
        relationship: "neighbor",
      },
    ]);
    expect(children.map((child) => child.firstName)).toEqual(["Ana", "Zoe"]);
    expect(children.map((child) => child.firstName)).not.toContain("Mika");
  });
});
