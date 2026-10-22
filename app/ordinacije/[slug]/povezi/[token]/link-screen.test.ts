import { describe, expect, it } from "vitest";

import { ok, fail } from "@/lib/action-result";

import { childLinkScreen } from "./link-screen";
import { readConfirmResult } from "./schema";

const child = {
  firstName: "Mika",
  lastName: "Mikić",
  dateOfBirth: "2016-05-04",
  relationship: "mother" as const,
};

describe("child link screen", () => {
  it("hides the child name until confirmation adds the child", () => {
    const waiting = childLinkScreen({ status: "open" }, null);
    expect(waiting).toEqual({ kind: "confirm", error: null });
    expect(JSON.stringify(waiting)).not.toContain("Mika");

    const unconfirmed = readConfirmResult({ status: "missing", first_name: "Mika", last_name: "Mikić" });
    expect(unconfirmed).toEqual({ status: "missing" });
    expect(JSON.stringify(unconfirmed)).not.toContain("Mika");

    const added = childLinkScreen({ status: "open" }, ok(child));
    expect(added).toEqual({ kind: "added", firstName: "Mika", lastName: "Mikić" });
  });

  it("keeps a failed confirmation on the form without a chart name", () => {
    const screen = childLinkScreen({ status: "open" }, fail("Poziv nije važeći."));
    expect(screen).toEqual({ kind: "confirm", error: "Poziv nije važeći." });
    expect(JSON.stringify(screen)).not.toContain("Mika");
  });
});
