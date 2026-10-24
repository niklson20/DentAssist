import Link from "next/link";

import { calendarPath } from "@/app/danas/schema";
import { buttonVariants } from "@/components/ui/button";
import { formatBelgradeDate, type CalendarQuery } from "@/lib/calendar-dates";
import { cn } from "@/lib/utils";

export function DateJump({ query }: { query: CalendarQuery }) {
  const today = formatBelgradeDate(new Date());

  return (
    <Link
      href={calendarPath(query, { datum: today })}
      aria-current={query.datum === today ? "date" : undefined}
      aria-label="Idi na današnji dan"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      Danas
    </Link>
  );
}
