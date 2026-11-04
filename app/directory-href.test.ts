import { describe, expect, it } from "vitest";

import {
  directoryHref,
  directoryNearMeMaxDistanceKm,
  DIRECTORY_NEAR_ME_RADIUS_KM,
  paginateDirectory,
  parseDirectoryPage,
} from "@/app/directory-href";

describe("directory near me radius", () => {
  it("applies only with coordinates and without city or name filters", () => {
    expect(
      directoryNearMeMaxDistanceKm({ lat: 45.25, lng: 19.85 }),
    ).toBe(DIRECTORY_NEAR_ME_RADIUS_KM);
    expect(directoryNearMeMaxDistanceKm({ lat: 45.25, lng: 19.85, city: "Novi Sad" })).toBeNull();
    expect(directoryNearMeMaxDistanceKm({ lat: 45.25, lng: 19.85, name: "dent" })).toBeNull();
    expect(directoryNearMeMaxDistanceKm({})).toBeNull();
  });
});

describe("directory pages", () => {
  it("keeps the first page on the clean directory url", () => {
    expect(directoryHref({ strana: 1 })).toBe("/");
    expect(directoryHref({ grad: "Beograd", strana: 2, prikaz: "lista" })).toBe(
      "/?grad=Beograd&prikaz=lista&strana=2",
    );
  });

  it("reads a missing or invalid page as the first page", () => {
    expect(parseDirectoryPage(undefined)).toBe(1);
    expect(parseDirectoryPage("0")).toBe(1);
    expect(parseDirectoryPage("abc")).toBe(1);
    expect(parseDirectoryPage("3")).toBe(3);
  });

  it("shows twenty clinics per page and clamps a page past the end", () => {
    const clinics = Array.from({ length: 21 }, (_, index) => index + 1);
    const first = paginateDirectory(clinics, 1);
    const second = paginateDirectory(clinics, 2);
    const pastEnd = paginateDirectory(clinics, 9);

    expect(first.pageCount).toBe(2);
    expect(first.items).toHaveLength(20);
    expect(second.items).toEqual([21]);
    expect(pastEnd.page).toBe(2);
    expect(pastEnd.items).toEqual([21]);
  });
});
