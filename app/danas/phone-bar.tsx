"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";

import { signOutStaff } from "@/app/danas/actions";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

const tabClass =
  "flex w-full items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground";

export function PhoneBar() {
  const pathname = usePathname();
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(signOutStaff, null);
  const signOutError = result && !result.ok ? result.error : null;
  const onRequests = pathname === "/zahtevi" || pathname.startsWith("/zahtevi/");
  const onCalendar = pathname === "/danas" || pathname.startsWith("/danas/");

  return (
    <nav
      aria-label="Mobilna navigacija"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
        <Link href="/zahtevi" aria-current={onRequests ? "page" : undefined} className={tabClass}>
          Zahtevi
        </Link>
        <Link href="/danas" aria-current={onCalendar ? "page" : undefined} className={tabClass}>
          Kalendar
        </Link>
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
