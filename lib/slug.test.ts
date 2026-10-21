import { describe, expect, it } from "vitest";
import { allocateSlug, slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("folds Serbian letters into latin and dashes", () => {
    expect(slugify("Đorđe Šarić", "patient")).toBe("djordje-saric");
    expect(slugify("Čć Šž", "patient")).toBe("cc-sz");
    expect(slugify("Ana  Marija Džajić", "patient")).toBe("ana-marija-dzajic");
    expect(slugify("Pacijent 12", "patient")).toBe("pacijent-12");
    expect(slugify("a_b---c", "patient")).toBe("a-b-c");
  });

  it("uses a stable fallback when nothing latin remains", () => {
    expect(slugify("   ", "patient")).toBe("karton");
    expect(slugify("---", "clinic")).toBe("ordinacija");
    expect(slugify("Марко", "patient")).toBe("karton");
  });

  it("adds -2 and -3 when the base slug is already taken", () => {
    expect(uniqueSlug("marko", [])).toBe("marko");
    expect(uniqueSlug("marko", ["marko"])).toBe("marko-2");
    expect(uniqueSlug("marko", ["marko", "marko-2"])).toBe("marko-3");
    expect(allocateSlug("Marko", "patient", ["marko", "marko-2"])).toBe("marko-3");
    expect(allocateSlug("", "clinic", ["ordinacija"])).toBe("ordinacija-2");
    expect(allocateSlug("Marko 2", "patient", ["marko-2"])).toBe("marko-2-2");
  });
});
