import { describe, expect, it } from "vitest";

import { addChildSchema } from "./schema";

describe("addChildSchema", () => {
  it("rejects a future birth date and a missing relationship", () => {
    const result = addChildSchema.safeParse({
      slug: "centar",
      firstName: "Luka",
      lastName: "Lukić",
      dateOfBirth: "2999-01-01",
      relationship: "mother",
    });
    expect(result.success).toBe(false);

    const missing = addChildSchema.safeParse({
      slug: "centar",
      firstName: "Luka",
      lastName: "Lukić",
      dateOfBirth: "2017-04-05",
      relationship: "",
    });
    expect(missing.success).toBe(false);
  });
});
