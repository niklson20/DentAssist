"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signOutStaff } from "@/app/danas/actions";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export type PhoneTab = "requests" | "calendar";

const tabClass =
  "flex w-full items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground";

export function PhoneBar({
  activeTab,
  onTabChange,
}: {
  activeTab: PhoneTab;
  onTabChange: (tab: PhoneTab) => void;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signOutStaff, null);
  const signOutError = result && !result.ok ? result.error : null;

  return (
    <nav
      aria-label="Mobilna navigacija"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        <button
          type="button"
          aria-pressed={activeTab === "requests"}
          aria-controls="phone-requests-panel"
          className={tabClass}
          onClick={() => onTabChange("requests")}
        >
          Zahtevi
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "calendar"}
          aria-controls="phone-calendar-panel"
          className={tabClass}
          onClick={() => onTabChange("calendar")}
        >
          Kalendar
        </button>
        <Link href="/pacijenti" className={tabClass}>
          Pacijenti
        </Link>
        <details className="relative">
          <summary className={cn(tabClass, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
            Još
          </summary>
          <div
            id="phone-more-menu"
            className="absolute right-0 bottom-full mb-2 flex min-w-40 flex-col gap-1 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg"
          >
            <Link
              href="/podesavanja"
              className="rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Podešavanja
            </Link>
            <form action={formAction}>
              {signOutError ? (
                <p role="alert" className="px-3 text-sm text-destructive">
                  {signOutError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                Odjava
              </button>
            </form>
          </div>
        </details>
      </div>
    </nav>
  );
}
