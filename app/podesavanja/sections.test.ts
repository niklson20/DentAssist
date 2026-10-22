import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS, settingsSectionsFor } from "./sections";

describe("settingsSectionsFor", () => {
  it("shows the owner every settings section", () => {
    expect(settingsSectionsFor("owner").map((section) => section.href)).toEqual(
      SETTINGS_SECTIONS.map((section) => section.href),
    );
  });

  it("shows reception only the account section", () => {
    expect(settingsSectionsFor("reception").map((section) => section.href)).toEqual([
      "/podesavanja/nalog",
    ]);
  });

  it("shows a dentist working hours and account", () => {
    expect(settingsSectionsFor("dentist").map((section) => section.href)).toEqual([
      "/podesavanja/radno-vreme",
      "/podesavanja/nalog",
    ]);
  });
});
