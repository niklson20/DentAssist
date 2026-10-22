import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { settingsPinSchema } from "./pin-schema";
import {
  isLiveStaffInvite,
  parseOwnerSettingsPin,
  sessionIdFromClaims,
  settingsPinCookieMatches,
  settingsPinRequired,
} from "./pin-gate";

const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pinHash =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("settingsPinSchema", () => {
  it("asks for a 6-digit PIN", () => {
    expect(settingsPinSchema.safeParse({ pin: "12345" }).success).toBe(false);
    expect(settingsPinSchema.safeParse({ pin: "123456" }).success).toBe(true);
    const trimmed = settingsPinSchema.safeParse({ pin: " 123456 " });
    expect(trimmed.success ? trimmed.data : null).toEqual({ pin: "123456" });
  });
});

describe("settingsPinRequired", () => {
  it("lets the sole owner through when no live invite exists", () => {
    expect(settingsPinRequired({ role: "owner", memberCount: 1, liveInviteCount: 0 })).toBe(false);
  });

  it("locks the owner when another member or a live invite exists", () => {
    expect(settingsPinRequired({ role: "owner", memberCount: 2, liveInviteCount: 0 })).toBe(true);
    expect(settingsPinRequired({ role: "owner", memberCount: 1, liveInviteCount: 1 })).toBe(true);
  });

  it("lets a dentist and reception through", () => {
    expect(settingsPinRequired({ role: "dentist", memberCount: 3, liveInviteCount: 2 })).toBe(false);
    expect(settingsPinRequired({ role: "reception", memberCount: 3, liveInviteCount: 2 })).toBe(false);
  });

  it("stays locked when the counts are unusable", () => {
    expect(settingsPinRequired({ role: "owner", memberCount: 0, liveInviteCount: 0 })).toBe(true);
    expect(settingsPinRequired({ role: "owner", memberCount: 1.5, liveInviteCount: 0 })).toBe(true);
  });
});

describe("isLiveStaffInvite", () => {
  const now = Date.parse("2026-10-22T12:00:00.000Z");

  it("counts an unused invite that has not expired", () => {
    expect(
      isLiveStaffInvite(
        { usedAt: null, attemptCount: 0, expiresAt: "2026-10-23T12:00:00.000Z" },
        now,
      ),
    ).toBe(true);
  });

  it("ignores a used, expired, or locked invite", () => {
    expect(
      isLiveStaffInvite(
        { usedAt: "2026-10-01T00:00:00.000Z", attemptCount: 0, expiresAt: "2026-10-23T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isLiveStaffInvite(
        { usedAt: null, attemptCount: 0, expiresAt: "2026-10-21T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isLiveStaffInvite(
        { usedAt: null, attemptCount: 5, expiresAt: "2026-10-23T12:00:00.000Z" },
        now,
      ),
    ).toBe(false);
  });
});

describe("settings pin cookie", () => {
  it("matches only the current session id", () => {
    expect(sessionIdFromClaims({ session_id: sessionId.toUpperCase() })).toBe(sessionId);
    expect(sessionIdFromClaims({ session_id: "not-a-session" })).toBeNull();
    expect(settingsPinCookieMatches(sessionId, sessionId)).toBe(true);
    expect(settingsPinCookieMatches(sessionId.toUpperCase(), sessionId)).toBe(true);
    expect(settingsPinCookieMatches("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", sessionId)).toBe(false);
    expect(settingsPinCookieMatches(undefined, sessionId)).toBe(false);
    expect(settingsPinCookieMatches(sessionId, null)).toBe(false);
  });
});

describe("parseOwnerSettingsPin", () => {
  it("reads a ready hash and hides every other status", () => {
    expect(parseOwnerSettingsPin({ status: "ready", pin_hash: pinHash })).toEqual({
      status: "ready",
      pinHash,
    });
    expect(parseOwnerSettingsPin(JSON.stringify({ status: "unset" }))).toEqual({ status: "unset" });
    expect(parseOwnerSettingsPin({ status: "invalid" })).toEqual({ status: "invalid" });
    expect(parseOwnerSettingsPin({ status: "ready", pin_hash: "123456" })).toEqual({ status: "failed" });
    expect(parseOwnerSettingsPin(null)).toEqual({ status: "failed" });
  });
});

describe("settings page wiring", () => {
  const gated = [
    ["app/podesavanja/page.tsx", "loadGuide"],
    ["app/podesavanja/ordinacija/page.tsx", "loadClinicProfile"],
    ["app/podesavanja/osoblje/page.tsx", "loadStaffPage"],
    ["app/podesavanja/radno-vreme/page.tsx", "loadWorkingHoursPage"],
    ["app/podesavanja/tipovi/page.tsx", "loadAppointmentTypesPage"],
    ["app/podesavanja/uredjaji/page.tsx", "loadDevicesPage"],
    ["app/podesavanja/pravni-podaci/page.tsx", "loadLegalDataPage"],
  ] as const;

  it("checks the gate before each settings page loads data", () => {
    for (const [file, loader] of gated) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source.toLowerCase()).not.toContain("supabase");
      expect(source.indexOf("loadSettingsPinGate")).toBeGreaterThan(-1);
      expect(source.indexOf("loadSettingsPinGate")).toBeLessThan(source.indexOf(loader));
    }
  });

  it("leaves the account page outside the gate", () => {
    const source = readFileSync(path.join(process.cwd(), "app/podesavanja/nalog/page.tsx"), "utf8");
    expect(source).not.toContain("loadSettingsPinGate");
    expect(source).not.toContain("SettingsPinView");
  });

  it("keeps Supabase out of the pin form", () => {
    const form = readFileSync(path.join(process.cwd(), "app/podesavanja/pin-gate-form.tsx"), "utf8");
    const screen = readFileSync(path.join(process.cwd(), "app/podesavanja/pin-gate-screen.tsx"), "utf8");
    expect(form.toLowerCase()).not.toContain("supabase");
    expect(screen.toLowerCase()).not.toContain("supabase");
    expect(form).not.toContain("#");
    expect(screen).not.toContain("#");
  });
});
