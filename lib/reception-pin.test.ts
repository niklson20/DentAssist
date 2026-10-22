import { describe, expect, it } from "vitest";

import {
  parseReceptionDeviceList,
  parseReceptionPin,
  parseReceptionPinCleared,
  parseReceptionPinFailure,
} from "@/lib/reception-pin";

const memberId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const pinHash = "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("reception device list", () => {
  it("keeps only names for a live device", () => {
    const parsed = parseReceptionDeviceList({
      status: "ok",
      clinic_name: " Ordinacija \n",
      members: [
        {
          id: memberId.toUpperCase(),
          first_name: "Ana",
          last_name: "Jović",
          pin_hash: pinHash,
          email: "ana@example.com",
        },
      ],
    });
    expect(parsed).toEqual({
      status: "ok",
      clinicName: "Ordinacija",
      members: [{ id: memberId, firstName: "Ana", lastName: "Jović" }],
    });
  });

  it("treats a revoked device as empty", () => {
    expect(parseReceptionDeviceList({ status: "invalid" })).toEqual({ status: "invalid" });
  });
});

describe("reception PIN record", () => {
  it("returns the hash only while attempts remain", () => {
    expect(
      parseReceptionPin({
        status: "ready",
        pin_hash: pinHash,
        email: "Ana@Example.com",
        user_id: userId,
        attempt_count: 2,
      }),
    ).toEqual({
      status: "ready",
      pinHash,
      email: "ana@example.com",
      userId,
      attemptCount: 2,
    });
  });

  it("drops the hash once the password is required", () => {
    expect(
      parseReceptionPin({
        status: "password",
        email: "ana@example.com",
        user_id: userId,
        pin_hash: pinHash,
      }),
    ).toEqual({ status: "password", email: "ana@example.com", userId });
  });

  it("counts a wrong PIN and the fifth lock", () => {
    expect(parseReceptionPinFailure({ status: "wrong", attempt_count: 4 })).toEqual({
      status: "wrong",
      attemptCount: 4,
    });
    expect(parseReceptionPinFailure({ status: "password", attempt_count: 5 })).toEqual({
      status: "password",
      attemptCount: 5,
    });
    expect(parseReceptionPinCleared({ status: "ok" })).toEqual({ status: "ok" });
  });
});
