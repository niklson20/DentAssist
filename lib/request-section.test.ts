import { describe, expect, it } from "vitest";

import {
  REQUEST_PAGE_SIZE,
  parseRequestSection,
  readRequestPage,
  requestListPath,
  requestSectionStatuses,
} from "./request-section";

describe("request section address", () => {
  it("keeps pending on /zahtevi and puts the other three in sekcija", () => {
    expect(parseRequestSection(undefined)).toBe("pending");
    expect(parseRequestSection("prihvaceni")).toBe("accepted");
    expect(parseRequestSection("odbijeni")).toBe("rejected");
    expect(parseRequestSection("istekli")).toBe("expired");
    expect(parseRequestSection("pending")).toBe("invalid");
    expect(requestListPath("pending")).toBe("/zahtevi");
    expect(requestListPath("accepted")).toBe("/zahtevi?sekcija=prihvaceni");
    expect(requestListPath("rejected", 2)).toBe("/zahtevi?sekcija=odbijeni&stranica=2");
    expect(requestListPath("pending", 2)).toBe("/zahtevi?stranica=2");
    expect(readRequestPage("2")).toBe(2);
    expect(readRequestPage("0")).toBe(1);
    expect(REQUEST_PAGE_SIZE).toBe(20);
    expect(requestSectionStatuses("rejected")).toEqual(["rejected", "declined_by_patient"]);
  });
});
