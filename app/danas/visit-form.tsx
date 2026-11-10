"use client";

import { useActionState, useEffect, useId, useState, type FormEvent, type ReactNode } from "react";

import { saveVisit, updateVisit } from "@/app/actions/visits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { isVisitLocked } from "@/lib/calendar-dates";

export type VisitNote = {
  procedureDescription: string;
  recommendations: string;
  treatmentPlan: string;
  internalNotes: string;
};

export type VisitFormAppointment = {
  id: string;
  status: string;
  endsAt: string;
};

type VisitFormRole = "owner" | "dentist" | "reception";

const NOTE_FIELDS = ["opis", "preporuke", "plan", "beleske"] as const;

const shellClass =
  "flex max-w-lg flex-col gap-4 rounded-lg border border-border bg-card p-4 text-card-foreground";

const areaClass =
  "min-h-20 w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const fields = [
  { id: "visit-procedure", name: "opis", label: "Opis zahvata", key: "procedureDescription" },
  { id: "visit-recommendations", name: "preporuke", label: "Preporuke", key: "recommendations" },
  { id: "visit-plan", name: "plan", label: "Plan daljeg lečenja", key: "treatmentPlan" },
  { id: "visit-notes", name: "beleske", label: "Interne beleške", key: "internalNotes" },
] as const;

export function VisitForm({
  appointment,
  visit,
  role,
  now,
  embedded = false,
  completeOnSave = false,
  onSaved,
}: {
  appointment: VisitFormAppointment;
  visit: VisitNote | null;
  role: VisitFormRole;
  now: Date;
  embedded?: boolean;
  completeOnSave?: boolean;
  onSaved?: () => void;
}) {
  const formId = useId();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [result, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    visit ? updateVisit : saveVisit,
    null,
  );
  const endsAt = new Date(appointment.endsAt);
  const locked = Number.isNaN(endsAt.getTime()) || isVisitLocked(endsAt, now);
  const finished = appointment.status === "completed";
  const canWrite = finished || completeOnSave;
  const missing = finished && visit === null;
  const formError = result && !result.ok ? result.error : null;
  const shell = embedded ? "flex flex-col gap-4" : shellClass;
  const heading = embedded ? null : (
    <h2 id="visit-note-heading" className="text-lg font-semibold text-foreground">
      Zapis posete
    </h2>
  );

  useEffect(() => {
    if (result?.ok) onSaved?.();
  }, [onSaved, result]);

  if (role !== "owner" && role !== "dentist") {
    return (
      <section aria-labelledby={embedded ? undefined : "visit-note-heading"} className={shell}>
        {heading}
        <p className="text-sm text-muted-foreground">Zapis posete nije dostupan.</p>
      </section>
    );
  }

  if (!canWrite) return null;

  if (locked) {
    return (
      <section aria-labelledby={embedded ? undefined : "visit-note-heading"} className={shell}>
        {heading}
        {missing ? <MissingVisitMark /> : null}
        <p className="text-sm text-muted-foreground">Zapis je zaključan.</p>
        {visit ? <ReadOnlyNote visit={visit} /> : null}
      </section>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (confirmEmpty) {
      setConfirmEmpty(false);
      return;
    }
    if (isEmptyNote(event.currentTarget)) {
      event.preventDefault();
      setConfirmEmpty(true);
    }
  }

  return (
    <>
      <form
        id={formId}
        action={formAction}
        onSubmit={handleSubmit}
        noValidate
        className={shell}
      >
        {heading}
        <input type="hidden" name="termin" value={appointment.id} />
        {fields.map((field) => {
          const messageText = message(result, field.name);
          return (
            <Field key={field.id} id={field.id} label={field.label} message={messageText}>
              <textarea
                id={field.id}
                name={field.name}
                rows={3}
                maxLength={4000}
                defaultValue={visit?.[field.key] ?? ""}
                aria-invalid={messageText ? true : undefined}
                aria-describedby={describedBy(field.id, messageText)}
                className={areaClass}
              />
            </Field>
          );
        })}
        {result?.ok && !onSaved ? (
          <p role="status" className="text-sm text-foreground">
            Zapis je sačuvan.
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          Sačuvaj
        </Button>
      </form>
      <Dialog
        open={confirmEmpty}
        onOpenChange={(next) => {
          if (!next && !pending) setConfirmEmpty(false);
        }}
      >
        <DialogContent className="w-[min(20rem,calc(100%-2rem))]">
          <DialogTitle>Termin završen bez zapisa</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Sačuvaćete prazan zapis posete. Možete ga dopuniti dok važi rok za izmenu.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmEmpty(false)}
            >
              Otkaži
            </Button>
            <Button type="submit" form={formId} disabled={pending}>
              {pending ? "Čuvam…" : "Potvrdi"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function isEmptyNoteValues(values: Record<string, string>): boolean {
  return NOTE_FIELDS.every((name) => (values[name] ?? "").trim() === "");
}

export function isEmptyNote(form: HTMLFormElement): boolean {
  const values: Record<string, string> = {};
  for (const name of NOTE_FIELDS) {
    const field = form.elements.namedItem(name);
    values[name] = field && "value" in field ? String(field.value) : "";
  }
  return isEmptyNoteValues(values);
}

function MissingVisitMark() {
  return (
    <p
      role="status"
      className="w-fit rounded-md border border-destructive px-2 py-1 text-sm font-medium text-destructive"
    >
      Termin završen bez zapisa
    </p>
  );
}

function ReadOnlyNote({ visit }: { visit: VisitNote }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {fields.map((field) => {
        const value = visit[field.key].trim();
        return (
          <div key={field.id} className="flex flex-col gap-1">
            <dt className="font-medium text-foreground">{field.label}</dt>
            <dd className="text-muted-foreground">{value.length > 0 ? value : "—"}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Field({
  id,
  label,
  message,
  children,
}: {
  id: string;
  label: string;
  message?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {message ? (
        <p id={errorId(id)} className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function message(result: ActionResult<{ id: string }> | null, field: string): string | undefined {
  if (!result || result.ok) return undefined;
  return result.fieldErrors?.[field]?.[0];
}

function describedBy(id: string, messageText?: string): string | undefined {
  return messageText ? errorId(id) : undefined;
}

function errorId(id: string): string {
  return `${id}-error`;
}
