import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PendingClinicAccessRequest = {
  id: string;
  email: string;
  city: string;
  createdAt: Date;
};

/** Pending rows from /za-ordinacije. Platform admin RLS only. */
export async function listPendingClinicAccessRequests(): Promise<PendingClinicAccessRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clinic_access_requests")
    .select("id, email, city, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listPendingClinicAccessRequests failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    city: row.city,
    createdAt: new Date(row.created_at),
  }));
}
