import { describe, expect, it } from "vitest";

import {
  formatDentistLabel,
  parsePublicDentists,
  pickInitialDentistId,
  type PublicDentist,
} from "./dentist-preference";

const dentists: PublicDentist[] = [
  { id: "11111111-1111-4111-8111-111111111111", firstName: "Ana", lastName: "Jović" },
  { id: "22222222-2222-4222-8222-222222222222", firstName: "Marko", lastName: "Petrović" },
];

describe("pickInitialDentistId", () => {
  it("returns the first dentist when nothing is stored", () => {
    expect(pickInitialDentistId(dentists, null)).toBe(dentists[0].id);
  });

  it("keeps a stored dentist that is still listed", () => {
    expect(pickInitialDentistId(dentists, dentists[1].id)).toBe(dentists[1].id);
  });

  it("falls back to the first dentist when the stored id is gone", () => {
    expect(pickInitialDentistId(dentists, "00000000-0000-4000-8000-000000000099")).toBe(
      dentists[0].id,
    );
  });
});

describe("parsePublicDentists", () => {
  it("maps rpc json into public dentists", () => {
    expect(
      parsePublicDentists([
        { id: dentists[0].id, first_name: "Ana", last_name: "Jović" },
        { id: "bad" },
        null,
      ]),
    ).toEqual([dentists[0]]);
  });
});

describe("formatDentistLabel", () => {
  it("joins first and last name", () => {
    expect(formatDentistLabel(dentists[0])).toBe("Ana Jović");
  });
});
