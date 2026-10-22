import { describe, expect, it } from "vitest";

import {
  CLINIC_INVITE_SUBJECT,
  clinicInviteLink,
  clinicInviteText,
  hashDeviceSecret,
  hashInviteCode,
  hashInviteToken,
  isInviteCodeHash,
  randomInviteCode,
  staffInviteRoleLabel,
  staffInviteSubject,
  staffInviteText,
  verifyInviteCode,
} from "@/lib/clinic-invite";

describe("clinic invite tokens", () => {
  it("hashes the decoded token with the pepper", () => {
    const first = hashInviteToken("invite-token", "pepper");
    const second = hashInviteToken(" invite-token ", "pepper");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
    expect(hashInviteToken("invite-token", "other")).not.toBe(first);
    expect(hashInviteToken("invite-token", "  ")).toBeNull();
    expect(hashInviteToken("  ", "pepper")).toBeNull();
    expect(hashDeviceSecret(" device-secret ", "pepper")).toBe(hashInviteToken("device-secret", "pepper"));
  });

  it("builds the staff link and falls back to the current origin", () => {
    expect(clinicInviteLink("a/b", "https://dent.dentassist.rs/", null)).toBe(
      "https://dent.dentassist.rs/poziv/a%2Fb",
    );
    expect(clinicInviteLink("token", "", "http://localhost:3000")).toBe("http://localhost:3000/poziv/token");
    expect(clinicInviteLink("token", "javascript:alert(1)", null)).toBeNull();
    expect(clinicInviteLink("token", "", null)).toBeNull();
  });

  it("uses the clinic invite mail text", () => {
    expect(CLINIC_INVITE_SUBJECT).toBe("Otvorite ordinaciju");
    expect(clinicInviteText("https://dent.example/poziv/token", "123456")).toBe(
      "Link važi 7 dana: https://dent.example/poziv/token. Kod: 123456. Na stranici potvrdite mejl i postavite lozinku.",
    );
  });

  it("uses the colleague invite mail text", () => {
    expect(staffInviteRoleLabel("dentist")).toBe("stomatolog");
    expect(staffInviteRoleLabel("reception")).toBe("recepcija");
    expect(staffInviteSubject("Ordinacija\nJovanović")).toBe("Poziv u Ordinacija Jovanović");
    expect(
      staffInviteText({
        inviterName: "Ana Jović",
        roleLabel: "stomatolog",
        link: "https://dent.example/poziv/token",
        code: "123456",
      }),
    ).toBe(
      "Ana Jović vas poziva kao stomatolog. Link važi 7 dana: https://dent.example/poziv/token. Kod: 123456.",
    );
  });

  it("makes a six-digit code and an Argon2id hash that only that code verifies", async () => {
    const code = randomInviteCode();
    expect(code).toMatch(/^\d{6}$/);
    const hash = await hashInviteCode("123456");
    expect(isInviteCodeHash(hash)).toBe(true);
    expect(await verifyInviteCode(hash, "123456")).toBe(true);
    expect(await verifyInviteCode(hash, "000000")).toBe(false);
    expect(await verifyInviteCode("not-a-hash", "123456")).toBe(false);
  });
});
