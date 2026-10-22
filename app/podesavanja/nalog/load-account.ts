import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ownPinState, type OwnPinState } from "./pin-status";

/** Whether this member already stored a PIN. The hash is not loaded. */
export async function loadOwnPinState(): Promise<OwnPinState> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("own_pin_is_set");
    if (error) {
      console.error("own_pin_is_set rejected:", error.code ?? "unknown");
      return "unavailable";
    }
    return ownPinState(data);
  } catch (error) {
    console.error("own_pin_is_set failed:", error instanceof Error ? error.name : "unknown error");
    return "unavailable";
  }
}
