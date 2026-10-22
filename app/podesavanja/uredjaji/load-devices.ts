import { deviceHash } from "@/lib/reception-device";
import { listReceptionDevice } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ClinicDeviceView = {
  id: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
};

export type DevicesPageData =
  | {
      status: "ready";
      devices: ClinicDeviceView[];
      thisBrowserLinked: boolean;
    }
  | { status: "unavailable" };

export async function loadDevicesPage(clinicId: string): Promise<DevicesPageData> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("clinic_devices")
      .select("id, label, created_at, revoked_at")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("load_devices query failed:", error.code);
      return { status: "unavailable" };
    }

    const devices: ClinicDeviceView[] = (data ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    }));

    let thisBrowserLinked = false;
    const hashed = await deviceHash();
    if (hashed.status === "ok") {
      const listed = await listReceptionDevice(hashed.hash);
      thisBrowserLinked = listed.status === "ok";
    }

    return { status: "ready", devices, thisBrowserLinked };
  } catch (error) {
    console.error(
      "load_devices failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    return { status: "unavailable" };
  }
}
