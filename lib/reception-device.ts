import { cookies } from "next/headers";

import { hashDeviceSecret } from "@/lib/clinic-invite";
import { CLINIC_DEVICE_COOKIE } from "@/lib/reception-pin";

export type DeviceHash = { status: "ok"; hash: string } | { status: "missing" } | { status: "unavailable" };

/** HMAC of the HttpOnly clinic_device cookie. The raw secret never leaves this server. */
export async function deviceHash(): Promise<DeviceHash> {
  const pepper = process.env.TOKEN_PEPPER;
  if (!pepper?.trim()) {
    console.error("Reception PIN failed: TOKEN_PEPPER is not set");
    return { status: "unavailable" };
  }
  const store = await cookies();
  const secret = store.get(CLINIC_DEVICE_COOKIE)?.value ?? "";
  const hash = hashDeviceSecret(secret, pepper);
  if (!hash) {
    return { status: "missing" };
  }
  return { status: "ok", hash };
}
