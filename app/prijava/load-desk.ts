import { deviceHash } from "@/lib/reception-device";
import type { ReceptionDesk } from "@/lib/reception-pin-ui";
import { listReceptionDevice } from "@/lib/supabase/admin";

/** Names for a live reception computer. A revoked or unknown device returns null. */
export async function loadReceptionDesk(): Promise<ReceptionDesk | null> {
  const hashed = await deviceHash();
  if (hashed.status !== "ok") {
    return null;
  }
  const listed = await listReceptionDevice(hashed.hash);
  if (listed.status !== "ok") {
    return null;
  }
  return { clinicName: listed.clinicName, members: listed.members };
}
