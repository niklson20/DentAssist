import { describe, expect, it } from "vitest";

import { splitClinicDescription } from "./clinic-description";

describe("splitClinicDescription", () => {
  it("separates sentences into readable paragraphs", () => {
    expect(
      splitClinicDescription(
        "Stomatološka ordinacija Dentio. Telefoni: 021 551 209 i 069 551 2090. Radnim danima od 9 do 20 časova.",
      ),
    ).toEqual([
      "Stomatološka ordinacija Dentio.",
      "Telefoni: 021 551 209 i 069 551 2090.",
      "Radnim danima od 9 do 20 časova.",
    ]);
  });

  it("preserves line breaks and does not split common abbreviations", () => {
    expect(splitClinicDescription("Leči dr. Petrović.\nRadno vreme: 9–17h.")).toEqual([
      "Leči dr. Petrović.",
      "Radno vreme: 9–17h.",
    ]);
  });

  it("returns no paragraphs for blank descriptions", () => {
    expect(splitClinicDescription(" \n ")).toEqual([]);
  });
});
