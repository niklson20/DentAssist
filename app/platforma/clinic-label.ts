import type { ClinicStatus } from "@/lib/labels";

export function formatPlatformClinicStatus(status: ClinicStatus): string {
  return status === "disabled" ? "Pauzirana" : "Aktivna";
}
