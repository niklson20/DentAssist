import type { StaffRole } from "@/lib/auth";

export type StaffMenuItem = {
  href: string;
  label: string;
};

const ITEMS: StaffMenuItem[] = [
  { href: "/danas", label: "Danas" },
  { href: "/pacijenti", label: "Pacijenti" },
  { href: "/podesavanja", label: "Podešavanja" },
];

/** Statistika is the owner's item. Logout is a separate control. */
export function staffMenuItems(role: StaffRole | null): StaffMenuItem[] {
  if (role !== "owner") {
    return ITEMS;
  }
  return [...ITEMS, { href: "/statistika", label: "Statistika" }];
}

/** Clinic menu for today, patients, settings, and statistics. Directory, clinic page, and platform stay outside it. */
export function usesStaffShellMenu(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    matches(path, "/danas") ||
    matches(path, "/pacijenti") ||
    matches(path, "/podesavanja") ||
    matches(path, "/statistika")
  );
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
