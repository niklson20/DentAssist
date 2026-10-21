import { redirect } from "next/navigation";

export type StaffRole = "owner" | "dentist" | "reception";

export type MemberSession = {
  userId: string;
  clinicId: string;
  role: StaffRole;
};

export type PlatformAdminSession = {
  userId: string;
};

export async function requireMember(): Promise<MemberSession> {
  const member = await findMember();
  if (!member) {
    redirect("/prijava");
  }
  return member;
}

export async function requireOwner(): Promise<MemberSession> {
  const member = await requireMember();
  if (member.role !== "owner") {
    redirect("/prijava");
  }
  return member;
}

export async function requirePlatformAdmin(): Promise<PlatformAdminSession> {
  const admin = await findPlatformAdmin();
  if (!admin) {
    redirect("/prijava");
  }
  return admin;
}

function findMember(): Promise<MemberSession | null> {
  return Promise.resolve(null);
}

function findPlatformAdmin(): Promise<PlatformAdminSession | null> {
  return Promise.resolve(null);
}
