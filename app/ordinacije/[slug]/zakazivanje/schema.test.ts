import { describe, expect, it } from "vitest";

import { isChildRoute } from "./schema";

describe("isChildRoute", () => {
  it("treats the 15th birthday as an adult and the day before as a child", () => {
    expect(isChildRoute("2011-10-23", "2026-10-23")).toBe(false);
    expect(isChildRoute("2011-10-24", "2026-10-23")).toBe(true);
    expect(isChildRoute(null, "2026-10-23")).toBe(false);
    expect(isChildRoute("", "2026-10-23")).toBe(false);
  });
});
