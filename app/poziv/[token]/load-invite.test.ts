import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readClinicInvite: vi.fn(),
  readStaffInvite: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  readClinicInvite: mocks.readClinicInvite,
  readStaffInvite: mocks.readStaffInvite,
}));

import { hashInviteToken } from "@/lib/clinic-invite";
import { loadInviteScreen } from "./load-invite";

const token = "invite-token";
const pepper = "test-pepper";

beforeEach(() => {
  mocks.readClinicInvite.mockReset();
  mocks.readStaffInvite.mockReset();
  vi.stubEnv("TOKEN_PEPPER", pepper);
});

describe("loadInviteScreen", () => {
  it("does not call the database when the pepper is missing", async () => {
    vi.stubEnv("TOKEN_PEPPER", "");
    await expect(loadInviteScreen(token)).resolves.toEqual({ status: "unavailable" });
    expect(mocks.readClinicInvite).not.toHaveBeenCalled();
    expect(mocks.readStaffInvite).not.toHaveBeenCalled();
  });

  it("keeps an open clinic invite on the owner form and does not read a colleague invite", async () => {
    mocks.readClinicInvite.mockResolvedValue({
      status: "ready",
      email: "vlasnik@example.com",
      codeHash: "$argon2id$secret",
    });
    const screen = await loadInviteScreen(token);
    expect(screen).toEqual({ status: "clinic" });
    expect(mocks.readClinicInvite).toHaveBeenCalledWith(hashInviteToken(token, pepper));
    expect(mocks.readStaffInvite).not.toHaveBeenCalled();
    expect(screen).not.toHaveProperty("codeHash");
    expect(screen).not.toHaveProperty("email");
  });

  it("shows a dentist invite without the code hash", async () => {
    mocks.readClinicInvite.mockResolvedValue({ status: "invalid" });
    mocks.readStaffInvite.mockResolvedValue({
      status: "ready",
      email: "kolega@example.com",
      codeHash: "$argon2id$secret",
      role: "dentist",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
    });
    await expect(loadInviteScreen("dentist-token")).resolves.toEqual({
      status: "staff",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
      roleLabel: "stomatolog",
    });
  });

  it("shows a receptionist invite", async () => {
    mocks.readClinicInvite.mockResolvedValue({ status: "invalid" });
    mocks.readStaffInvite.mockResolvedValue({
      status: "ready",
      email: "kolega@example.com",
      codeHash: "$argon2id$secret",
      role: "reception",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
    });
    await expect(loadInviteScreen("reception-token")).resolves.toEqual({
      status: "staff",
      clinicName: "Ordinacija Jovanović",
      inviterName: "Ana Jović",
      roleLabel: "recepcija",
    });
  });

  it("says the link is dead when neither invite is open", async () => {
    mocks.readClinicInvite.mockResolvedValue({ status: "invalid" });
    mocks.readStaffInvite.mockResolvedValue({ status: "invalid" });
    await expect(loadInviteScreen("dead-token")).resolves.toEqual({ status: "invalid" });
  });

  it("does not guess a colleague invite when the clinic read fails", async () => {
    mocks.readClinicInvite.mockResolvedValue({ status: "failed" });
    await expect(loadInviteScreen("failed-token")).resolves.toEqual({ status: "unavailable" });
    expect(mocks.readStaffInvite).not.toHaveBeenCalled();
  });
});
