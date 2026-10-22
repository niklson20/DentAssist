import { describe, expect, it } from "vitest";

import {
  PIN_IDLE_MS,
  PIN_LOCK_ERROR,
  pinEntryExpired,
  receptionScreen,
  wrongPinMessage,
} from "@/lib/reception-pin-ui";

const desk = {
  clinicName: "Ordinacija",
  members: [{ id: "22222222-2222-4222-8222-222222222222", firstName: "Ana", lastName: "Jović" }],
};

describe("reception screen", () => {
  it("shows names for a linked device even when a staff session already exists", () => {
    expect(receptionScreen(desk, "/danas")).toEqual({ kind: "desk", desk });
  });

  it("does not offer names when the device is missing or revoked", () => {
    expect(receptionScreen(null, null)).toEqual({ kind: "login" });
    expect(receptionScreen(null, "/danas")).toEqual({ kind: "redirect", href: "/danas" });
  });
});

describe("reception PIN pad", () => {
  it("returns to names after two minutes without a touch", () => {
    expect(pinEntryExpired(0, PIN_IDLE_MS - 1)).toBe(false);
    expect(pinEntryExpired(0, PIN_IDLE_MS)).toBe(true);
  });

  it("tells how many attempts remain and asks for the password on the fifth", () => {
    expect(wrongPinMessage(1)).toBe("Pogrešan PIN. Ostala su još 4 pokušaja.");
    expect(wrongPinMessage(4)).toBe("Pogrešan PIN. Ostao je još 1 pokušaj.");
    expect(wrongPinMessage(5)).toBe(PIN_LOCK_ERROR);
  });
});
