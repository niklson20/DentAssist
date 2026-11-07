"use client";

import { useRouter } from "next/navigation";

import styles from "./month-field.module.css";

const fieldClassName =
  "w-full cursor-pointer rounded-md border border-border bg-card py-2 pr-3 pl-9 text-sm text-foreground shadow-sm";

export function StatisticsMonthField({ month }: { month: string }) {
  const router = useRouter();

  return (
    <span className="relative block">
      <input
        key={month}
        className={`${fieldClassName} ${styles.input}`}
        type="month"
        name="mesec"
        defaultValue={month}
        required
        onClick={(event) => {
          openMonthPicker(event.currentTarget);
        }}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (!/^\d{4}-\d{2}$/.test(value) || value === month) {
            return;
          }
          const params = new URLSearchParams(window.location.search);
          params.set("mesec", value);
          router.push(`/statistika?${params.toString()}`);
        }}
      />
      <CalendarIcon />
    </span>
  );
}

function openMonthPicker(input: HTMLInputElement) {
  if (typeof input.showPicker !== "function") {
    return;
  }
  try {
    input.showPicker();
  } catch {
    // The picker is already open, or this click was not a user gesture.
  }
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
