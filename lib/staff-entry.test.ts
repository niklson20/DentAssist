import { describe, expect, it } from "vitest";

import { staffEntryHref } from "@/lib/staff-entry";

describe("staffEntryHref", () => {
  it("opens login when the staff site is the local directory", () => {
    expect(
      staffEntryHref({
        staffUrl: "http://127.0.0.1:3000",
        appUrl: "http://127.0.0.1:3000",
        requestOrigin: "http://127.0.0.1:3000",
      }),
    ).toBe("http://127.0.0.1:3000/prijava");
  });

  it("opens login when staff and public share one host", () => {
    expect(
      staffEntryHref({
        staffUrl: "https://dentassist.rs/",
        appUrl: "https://dentassist.rs",
      }),
    ).toBe("https://dentassist.rs/prijava");
  });

  it("keeps the staff root when that host is separate", () => {
    expect(
      staffEntryHref({
        staffUrl: "https://dent.dentassist.rs",
        appUrl: "https://dentassist.rs",
        requestOrigin: "https://dentassist.rs",
      }),
    ).toBe("https://dent.dentassist.rs");
  });

  it("opens login on the current origin when STAFF_URL is unset", () => {
    expect(
      staffEntryHref({
        requestOrigin: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000/prijava");
    expect(staffEntryHref({})).toBe("/prijava");
  });
});
