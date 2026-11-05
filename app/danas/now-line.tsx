"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { BELGRADE_TIME_ZONE, formatBelgradeDate } from "@/lib/calendar-dates";

export function nowLineFraction(startHour: number, span: number, minutes: number): number | null {
  if (span <= 0 || !Number.isFinite(minutes)) {
    return null;
  }
  const start = startHour * 60;
  const end = start + span * 60;
  if (minutes < start || minutes > end) {
    return null;
  }
  return (minutes - start) / (span * 60);
}

export function nextMinuteDelay(nowMs: number): number {
  const remainder = nowMs % 60_000;
  return remainder === 0 ? 60_000 : 60_000 - remainder;
}

export function belgradeMinutes(instant: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BELGRADE_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const value: Record<string, string> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      value[part.type] = part.value;
    }
  }
  let hour = Number(value.hour);
  const minute = Number(value.minute);
  if (hour === 24) {
    hour = 0;
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return Number.NaN;
  }
  return hour * 60 + minute;
}

export function NowLine({
  dates,
  startHour,
  span,
}: {
  dates: string[];
  startHour: number;
  span: number;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, nextMinuteDelay(Date.now()));
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  if (!now || !dates.includes(formatBelgradeDate(now))) {
    return null;
  }
  const fraction = nowLineFraction(startHour, span, belgradeMinutes(now));
  if (fraction === null) {
    return null;
  }

  return (
    <div
      className="calendar-grid__now"
      style={{ "--now-fraction": String(fraction) } as CSSProperties}
      aria-hidden="true"
    />
  );
}
