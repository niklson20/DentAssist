import type { ActionResult } from "@/lib/action-result";

import type { ChildLinkFailureStatus, ChildLinkPreview, ConfirmedChild } from "./schema";

export const CHILD_LINK_UNAVAILABLE = "Povezivanje trenutno nije moguće. Pokušajte ponovo.";

export const childLinkFailureMessage: Record<ChildLinkFailureStatus, string> = {
  expired: "Poziv je istekao.",
  used: "Poziv je već potvrđen.",
  mismatch: "Ovaj poziv nije za mejl na koji ste prijavljeni.",
  missing: "Poziv nije važeći.",
  incomplete: CHILD_LINK_UNAVAILABLE,
};

export type ChildLinkScreen =
  | { kind: "confirm"; error: string | null }
  | { kind: "added"; firstName: string; lastName: string }
  | { kind: "message"; text: string };

export function childLinkScreen(
  preview: ChildLinkPreview,
  result: ActionResult<ConfirmedChild> | null,
): ChildLinkScreen {
  if (result?.ok) {
    return {
      kind: "added",
      firstName: result.data.firstName,
      lastName: result.data.lastName,
    };
  }
  if (preview.status === "open") {
    return { kind: "confirm", error: result && !result.ok ? result.error : null };
  }
  if (result && !result.ok) {
    return { kind: "message", text: result.error };
  }
  if (preview.status === "unavailable") {
    return { kind: "message", text: CHILD_LINK_UNAVAILABLE };
  }
  return { kind: "message", text: childLinkFailureMessage[preview.status] };
}
