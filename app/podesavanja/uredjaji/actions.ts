"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/auth";
import { deviceHash } from "@/lib/reception-device";
import { CLINIC_DEVICE_COOKIE } from "@/lib/reception-pin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  clearDeviceCookieOptions,
  deviceCookieOptions,
  deviceSecretHash,
  randomDeviceSecret,
} from "./device-cookie";
import { deviceIdSchema, pairDeviceSchema } from "./schema";

const DEVICES_PATH = "/podesavanja/uredjaji";
const SAVE_UNAVAILABLE = "Radnja trenutno nije moguća. Pokušajte ponovo.";

export async function pairCurrentDevice(
  _previous: ActionResult<{ paired: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ paired: true }>> {
  const member = await requireOwner();
  const parsed = pairDeviceSchema.safeParse({ label: formData.get("label") });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  const pepper = process.env.TOKEN_PEPPER?.trim();
  if (!pepper) {
    return fail(SAVE_UNAVAILABLE);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const ownerMember = await supabase
      .from("clinic_members")
      .select("id")
      .eq("clinic_id", member.clinicId)
      .eq("user_id", member.userId)
      .maybeSingle();

    if (ownerMember.error || !ownerMember.data?.id) {
      console.error("pair_device owner member failed:", ownerMember.error?.code ?? "missing row");
      return fail(SAVE_UNAVAILABLE);
    }

    const hashed = await deviceHash();
    const now = new Date().toISOString();
    if (hashed.status === "ok") {
      const { error: revokeError } = await supabase
        .from("clinic_devices")
        .update({ revoked_at: now })
        .eq("clinic_id", member.clinicId)
        .eq("secret_hash", hashed.hash)
        .is("revoked_at", null);
      if (revokeError) {
        console.error("pair_device revoke previous failed:", revokeError.code);
        return fail(SAVE_UNAVAILABLE);
      }
    }

    const secret = randomDeviceSecret();
    const secretHash = deviceSecretHash(secret, pepper);
    if (!secretHash) {
      return fail(SAVE_UNAVAILABLE);
    }

    const { error: insertError } = await supabase.from("clinic_devices").insert({
      clinic_id: member.clinicId,
      label: parsed.data.label,
      enrolled_by: ownerMember.data.id,
      secret_hash: secretHash,
    });

    if (insertError) {
      console.error("pair_device insert failed:", insertError.code);
      return fail(SAVE_UNAVAILABLE);
    }

    const store = await cookies();
    store.set(CLINIC_DEVICE_COOKIE, secret, deviceCookieOptions());

    revalidatePath(DEVICES_PATH);
    return ok({ paired: true });
  } catch (error) {
    console.error("pair_device failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

export async function revokeClinicDevice(
  _previous: ActionResult<{ revoked: true }> | null,
  formData: FormData,
): Promise<ActionResult<{ revoked: true }>> {
  const member = await requireOwner();
  const parsed = deviceIdSchema.safeParse({ deviceId: formData.get("deviceId") });
  if (!parsed.success) {
    return fail("Proverite unete podatke.", fieldErrorsFrom(parsed.error));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const now = new Date().toISOString();
    const hashed = await deviceHash();
    let clearedCookie = false;

    if (hashed.status === "ok") {
      const { data, error } = await supabase
        .from("clinic_devices")
        .update({ revoked_at: now })
        .eq("id", parsed.data.deviceId)
        .eq("clinic_id", member.clinicId)
        .eq("secret_hash", hashed.hash)
        .is("revoked_at", null)
        .select("id");

      if (error) {
        console.error("revoke_device matched failed:", error.code);
        return fail(SAVE_UNAVAILABLE);
      }

      if (data?.length) {
        clearedCookie = true;
      }
    }

    if (!clearedCookie) {
      const { data, error } = await supabase
        .from("clinic_devices")
        .update({ revoked_at: now })
        .eq("id", parsed.data.deviceId)
        .eq("clinic_id", member.clinicId)
        .is("revoked_at", null)
        .select("id");

      if (error) {
        console.error("revoke_device failed:", error.code);
        return fail(SAVE_UNAVAILABLE);
      }

      if (!data?.length) {
        return fail(SAVE_UNAVAILABLE);
      }
    }

    if (clearedCookie) {
      const store = await cookies();
      store.set(CLINIC_DEVICE_COOKIE, "", clearDeviceCookieOptions());
    }

    revalidatePath(DEVICES_PATH);
    return ok({ revoked: true });
  } catch (error) {
    console.error("revoke_device failed:", error instanceof Error ? error.name : "unknown error");
    return fail(SAVE_UNAVAILABLE);
  }
}

function fieldErrorsFrom(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = fieldErrors[key] ?? [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}
