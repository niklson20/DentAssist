import { loadStaffMenuRole } from "@/app/danas/load-staff-menu";

import { AppMenuClient } from "./app-menu-client";

export async function AppMenu({ children }: { children: React.ReactNode }) {
  const role = await loadStaffMenuRole();
  return <AppMenuClient role={role}>{children}</AppMenuClient>;
}
