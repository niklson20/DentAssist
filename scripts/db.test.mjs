import { describe, expect, it } from "vitest";

import {
  PRODUCTION_REF,
  RESET_ARGS,
  envProjectRefs,
  planReset,
  projectRefFromUrl,
} from "./db.mjs";

describe("db:reset", () => {
  it("uses the protected project ref from the task", () => {
    expect(PRODUCTION_REF).toBe("iirzzaykgskjouzzvdrd");
  });

  it("refuses the protected project when it is linked", () => {
    expect(planReset({ linkedRef: PRODUCTION_REF, envRefs: [] }).ok).toBe(false);
  });

  it("refuses the protected project when it is only in the environment", () => {
    expect(
      planReset({
        linkedRef: "aaaaaaaaaaaaaaaaaaaa",
        envRefs: [PRODUCTION_REF],
      }).ok,
    ).toBe(false);
  });

  it("refuses an unknown linked project", () => {
    expect(planReset({ linkedRef: "", envRefs: [] }).ok).toBe(false);
  });

  it("refuses when the environment ref disagrees with the linked project", () => {
    expect(
      planReset({
        linkedRef: "aaaaaaaaaaaaaaaaaaaa",
        envRefs: ["bbbbbbbbbbbbbbbbbbbb"],
      }).ok,
    ).toBe(false);
  });

  it("allows a linked project that is not the protected ref", () => {
    expect(
      planReset({
        linkedRef: "aaaaaaaaaaaaaaaaaaaa",
        envRefs: ["aaaaaaaaaaaaaaaaaaaa"],
      }),
    ).toEqual({ ok: true, ref: "aaaaaaaaaaaaaaaaaaaa" });
  });

  it("applies the test seed only as part of reset", () => {
    expect(RESET_ARGS).toEqual(["db", "reset", "--linked", "--sql-paths", "seed.sql"]);
  });
});

describe("project ref from env", () => {
  it("reads an explicit ref and a supabase URL", () => {
    expect(projectRefFromUrl("https://iirzzaykgskjouzzvdrd.supabase.co")).toBe(PRODUCTION_REF);
    expect(
      envProjectRefs({
        SUPABASE_PROJECT_REF: "aaaaaaaaaaaaaaaaaaaa",
        NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
      }),
    ).toEqual(["aaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbb"]);
  });

  it("ignores a URL that is not a supabase host", () => {
    expect(projectRefFromUrl("https://example.com")).toBe("");
    expect(envProjectRefs({})).toEqual([]);
  });
});
