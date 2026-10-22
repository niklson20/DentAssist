import { hashInviteToken } from "@/lib/clinic-invite";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { PREVIEW_STATUSES, type ChildLinkPreview, type ChildLinkPreviewStatus } from "./schema";

export async function loadChildLinkPreview(slug: string, token: string): Promise<ChildLinkPreview> {
  const tokenHash = hashInviteToken(token, process.env.TOKEN_PEPPER);
  if (!tokenHash) {
    return { status: "unavailable" };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("preview_child_link", {
      p_slug: slug,
      p_token_hash: tokenHash,
    });
    if (error) {
      console.error("preview_child_link rejected:", error.code ?? "rejected");
      return { status: "unavailable" };
    }
    if (!isPreviewStatus(data) || data === "unavailable") {
      return { status: "unavailable" };
    }
    return { status: data };
  } catch (error) {
    console.error("preview_child_link failed:", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable" };
  }
}

function isPreviewStatus(value: unknown): value is ChildLinkPreviewStatus {
  return typeof value === "string" && (PREVIEW_STATUSES as readonly string[]).includes(value);
}
