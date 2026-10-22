import { z } from "zod";

export const ISO_DOW_ORDER = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoDow = (typeof ISO_DOW_ORDER)[number];

export const ISO_DOW_LABELS: Record<IsoDow, string> = {
  1: "Ponedeljak",
  2: "Utorak",
  3: "Sreda",
  4: "Četvrtak",
  5: "Petak",
  6: "Subota",
  7: "Nedelja",
};

const timeValueSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Unesite ispravno vreme.");

const dayScheduleSchema = z
  .object({
    isoDow: z.coerce.number().int().refine((value): value is IsoDow => ISO_DOW_ORDER.includes(value as IsoDow)),
    isClosed: z.boolean(),
    opensAt: z.string().trim(),
    closesAt: z.string().trim(),
    breakStartsAt: z.string().trim(),
    breakEndsAt: z.string().trim(),
  })
  .superRefine((day, ctx) => {
    if (day.isClosed) {
      return;
    }
    const opens = timeValueSchema.safeParse(day.opensAt);
    if (!opens.success) {
      ctx.addIssue({
        code: "custom",
        message: opens.error.issues[0]?.message ?? "Unesite ispravno vreme.",
        path: ["opensAt"],
      });
    }
    const closes = timeValueSchema.safeParse(day.closesAt);
    if (!closes.success) {
      ctx.addIssue({
        code: "custom",
        message: closes.error.issues[0]?.message ?? "Unesite ispravno vreme.",
        path: ["closesAt"],
      });
    }
    if (opens.success && closes.success && day.opensAt >= day.closesAt) {
      ctx.addIssue({
        code: "custom",
        message: "Kraj mora biti posle početka.",
        path: ["closesAt"],
      });
    }

    const hasBreakStart = day.breakStartsAt.length > 0;
    const hasBreakEnd = day.breakEndsAt.length > 0;
    if (hasBreakStart !== hasBreakEnd) {
      ctx.addIssue({
        code: "custom",
        message: "Unesite oba kraja pauze.",
        path: hasBreakStart ? ["breakEndsAt"] : ["breakStartsAt"],
      });
      return;
    }
    if (!hasBreakStart) {
      return;
    }
    const breakStart = timeValueSchema.safeParse(day.breakStartsAt);
    const breakEnd = timeValueSchema.safeParse(day.breakEndsAt);
    if (!breakStart.success) {
      ctx.addIssue({
        code: "custom",
        message: "Unesite ispravno vreme.",
        path: ["breakStartsAt"],
      });
    }
    if (!breakEnd.success) {
      ctx.addIssue({
        code: "custom",
        message: "Unesite ispravno vreme.",
        path: ["breakEndsAt"],
      });
    }
    if (
      opens.success &&
      closes.success &&
      breakStart.success &&
      breakEnd.success &&
      (day.breakStartsAt < day.opensAt ||
        day.breakEndsAt > day.closesAt ||
        day.breakStartsAt >= day.breakEndsAt)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Pauza mora biti unutar radnog vremena.",
        path: ["breakStartsAt"],
      });
    }
  });

export const workingHoursSaveSchema = z.object({
  memberId: z.string().uuid("Izaberite stomatologa."),
  days: z.array(dayScheduleSchema).length(7),
});

export type DayScheduleInput = z.infer<typeof dayScheduleSchema>;
export type WorkingHoursSaveInput = z.infer<typeof workingHoursSaveSchema>;

export type DayScheduleView = {
  isoDow: IsoDow;
  isClosed: boolean;
  opensAt: string;
  closesAt: string;
  breakStartsAt: string;
  breakEndsAt: string;
};

export function defaultDaySchedule(isoDow: IsoDow): DayScheduleView {
  const weekday = isoDow <= 5;
  return {
    isoDow,
    isClosed: !weekday,
    opensAt: weekday ? "09:00" : "",
    closesAt: weekday ? "17:00" : "",
    breakStartsAt: "",
    breakEndsAt: "",
  };
}

export function trimDbTime(value: string | null): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 5);
}

export function readWorkingHoursForm(formData: FormData): {
  memberId: FormDataEntryValue | null;
  days: DayScheduleInput[];
} {
  const days = ISO_DOW_ORDER.map((isoDow) => ({
    isoDow,
    isClosed: formData.get(`closed_${isoDow}`) === "true",
    opensAt: String(formData.get(`opens_${isoDow}`) ?? ""),
    closesAt: String(formData.get(`closes_${isoDow}`) ?? ""),
    breakStartsAt: String(formData.get(`breakStart_${isoDow}`) ?? ""),
    breakEndsAt: String(formData.get(`breakEnd_${isoDow}`) ?? ""),
  }));
  return { memberId: formData.get("memberId"), days };
}

export function toDbTime(value: string): string {
  return `${value}:00`;
}
