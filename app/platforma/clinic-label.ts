import type { PlatformClinicMember } from "@/app/actions/platform";
import type { ClinicStatus } from "@/lib/labels";
import { clinicStatusLabels, memberRoleLabels } from "@/lib/labels";

export function formatPlatformClinicMember(member: PlatformClinicMember): string {
  return `${member.firstName} ${member.lastName} (${memberRoleLabels[member.role]})`;
}

export function formatPlatformClinicStatus(status: ClinicStatus): string {
  return clinicStatusLabels[status];
}
