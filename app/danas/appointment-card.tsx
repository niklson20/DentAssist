"use client";

import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowSquareOut, PencilSimple } from "@phosphor-icons/react";

import { loadAppointmentDetails } from "@/app/actions/appointment-details";
import { setAppointmentStatus } from "@/app/actions/appointments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import {
  APPOINTMENT_STATUSES,
  appointmentStatusLabel,
  type AppointmentStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { AppointmentForm } from "./appointment-form";
import { VisitForm } from "./visit-form";

type AppointmentDetails = NonNullable<Awaited<ReturnType<typeof loadAppointmentDetails>>>;

type VisitDialogTarget = {
  id: string;
  endsAt: string;
  status: string;
  role: "owner" | "dentist";
};

const STATUS_BADGE_CLASS: Record<AppointmentStatus, string> = {
  pending_confirmation: "border-destructive/50 bg-destructive/25 text-foreground",
  offered: "border-primary bg-primary text-primary-foreground",
  scheduled: "border-border bg-secondary text-secondary-foreground",
  completed: "border-border bg-muted text-muted-foreground",
  no_show: "border-destructive/25 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-background text-muted-foreground line-through opacity-60",
};

function resolveAppointmentStatus(value: string | undefined): AppointmentStatus | null {
  return APPOINTMENT_STATUSES.find((status) => status === value) ?? null;
}

export function AppointmentCard({
  appointmentId,
  status,
  className,
  style,
  children,
}: {
  appointmentId: string;
  status: string;
  className: string;
  style: CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<AppointmentDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitTarget, setVisitTarget] = useState<VisitDialogTarget | null>(null);
  const headerStatus = resolveAppointmentStatus(details?.status ?? status);
  const closeDialog = useCallback(() => {
    setOpen(false);
    setEditing(false);
  }, []);
  const openVisitDialog = useCallback((target: VisitDialogTarget) => {
    setOpen(false);
    setEditing(false);
    setVisitTarget(target);
  }, []);

  useEffect(() => {
    if (!open || details) return;
    let current = true;
    setLoading(true);
    loadAppointmentDetails(appointmentId)
      .then((result) => {
        if (!current) return;
        if (result) setDetails(result);
        else setError("Podaci o terminu trenutno nisu dostupni.");
      })
      .catch(() => {
        if (current) setError("Podaci o terminu trenutno nisu dostupni.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [appointmentId, details, open]);

  return (
    <>
      <button
        type="button"
        className={`${className} cursor-pointer text-left`}
        style={style}
        data-status={status}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(false);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <DialogTitle>Detalji termina</DialogTitle>
              {headerStatus ? (
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-xs font-medium",
                    STATUS_BADGE_CLASS[headerStatus],
                  )}
                >
                  {appointmentStatusLabel(headerStatus)}
                </span>
              ) : null}
              {details?.status === "scheduled" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={editing ? "Sakrij izmenu termina" : "Izmeni termin"}
                  aria-expanded={editing}
                  title={editing ? "Sakrij izmenu termina" : "Izmeni termin"}
                  onClick={() => setEditing((current) => !current)}
                >
                  <PencilSimple aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>Zatvori</DialogClose>
          </div>
          {loading ? <p role="status" className="text-sm text-muted-foreground">Učitavam podatke termina…</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {details ? (
            <AppointmentDetailsPanel
              details={details}
              editing={editing}
              onCancelled={closeDialog}
              onComplete={() => {
                if (details.role !== "owner" && details.role !== "dentist") return;
                openVisitDialog({
                  id: details.appointment.id,
                  endsAt: details.appointment.endsAt,
                  status: details.status,
                  role: details.role,
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={visitTarget !== null}
        onOpenChange={(next) => {
          if (!next) setVisitTarget(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Zapis posete</DialogTitle>
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>Zatvori</DialogClose>
          </div>
          {visitTarget ? (
            <VisitForm
              embedded
              role={visitTarget.role}
              now={new Date()}
              visit={null}
              completeOnSave={visitTarget.status === "scheduled"}
              onSaved={() => setVisitTarget(null)}
              appointment={{
                id: visitTarget.id,
                status: visitTarget.status,
                endsAt: visitTarget.endsAt,
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppointmentDetailsPanel({
  details,
  editing,
  onCancelled,
  onComplete,
}: {
  details: AppointmentDetails;
  editing: boolean;
  onCancelled: () => void;
  onComplete: () => void;
}) {
  const { appointment, patient, dentistName, typeName, status, cancellationNote, choices, canComplete } = details;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-medium">Pacijent</dt>
        <dd>
          <Link
            href={patient.href}
            className="inline-flex items-center gap-1.5 font-medium text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground"
          >
            {patient.name}
            <ArrowSquareOut aria-hidden="true" className="size-3.5 opacity-70" />
            <span className="sr-only"> — otvori karton</span>
          </Link>
        </dd>
        <dt className="font-medium">Stomatolog</dt><dd>{dentistName}</dd>
        <dt className="font-medium">Datum i vreme</dt><dd>{details.dateLabel}, {details.timeLabel}</dd>
        <dt className="font-medium">Trajanje</dt><dd>{appointment.durationMinutes} minuta</dd>
        <dt className="font-medium">Tip</dt><dd>{typeName}</dd>
        <dt className="font-medium">Status</dt><dd>{appointmentStatusLabel(status)}</dd>
        <dt className="font-medium">Napomena</dt><dd className="whitespace-pre-wrap">{appointment.note || "Nema napomene."}</dd>
        {cancellationNote ? <><dt className="font-medium">Razlog otkazivanja</dt><dd>{cancellationNote}</dd></> : null}
      </dl>
      {status === "scheduled" && editing ? (
        <section className="border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-semibold">Izmeni termin</h3>
          <AppointmentForm
            key={appointment.id}
            embedded
            choices={choices}
            datum={appointment.startsAt.slice(0, 10)}
            today={formatBelgradeDate(new Date())}
            defaultDentistId={appointment.dentistId}
            termin={appointment}
          />
        </section>
      ) : null}
      {status === "scheduled" ? (
        <AppointmentStatusActions
          appointmentId={appointment.id}
          canComplete={canComplete}
          onCancelled={onCancelled}
          onComplete={onComplete}
        />
      ) : null}
    </div>
  );
}

function AppointmentStatusActions({
  appointmentId,
  canComplete,
  onCancelled,
  onComplete,
}: {
  appointmentId: string;
  canComplete: boolean;
  onCancelled: () => void;
  onComplete: () => void;
}) {
  const cancelFormId = `cancel-appointment-${appointmentId}`;
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const [cancelResult, cancelAction, cancelPending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(setAppointmentStatus, null);
  const [noShowResult, noShowAction, noShowPending] = useActionState<
    ActionResult<{ id: string }> | null,
    FormData
  >(setAppointmentStatus, null);
  const busy = cancelPending || noShowPending;

  useEffect(() => {
    if (!cancelResult?.ok && !noShowResult?.ok) return;
    setConfirmNoShow(false);
    onCancelled();
  }, [cancelResult, noShowResult, onCancelled]);

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <form id={cancelFormId} action={cancelAction} className="flex flex-col gap-2">
        <input type="hidden" name="termin" value={appointmentId} />
        <input type="hidden" name="status" value="cancelled" />
        <label htmlFor={`cancel-note-${appointmentId}`} className="text-sm font-medium">
          Razlog otkazivanja
        </label>
        <textarea
          id={`cancel-note-${appointmentId}`}
          name="poruka"
          required
          maxLength={300}
          className="min-h-20 rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
        />
        {cancelResult?.ok ? <p role="status" className="text-sm">Termin je otkazan.</p> : null}
        {cancelResult && !cancelResult.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {cancelResult.error}
          </p>
        ) : null}
      </form>
      {noShowResult?.ok ? <p role="status" className="text-sm">Termin je označen kao „Nije došao“.</p> : null}
      {noShowResult && !noShowResult.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {noShowResult.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirmNoShow(true)}
        >
          Nije došao
        </Button>
        <Button type="submit" form={cancelFormId} variant="destructive" disabled={busy}>
          {cancelPending ? "Otkazujem…" : "Otkaži termin"}
        </Button>
        {canComplete ? (
          <Button
            type="button"
            variant="default"
            className="ml-auto"
            disabled={busy}
            onClick={onComplete}
          >
            Završen
          </Button>
        ) : null}
      </div>
      <Dialog
        open={confirmNoShow}
        onOpenChange={(next) => {
          if (!next && !busy) setConfirmNoShow(false);
        }}
      >
        <DialogContent className="w-[min(20rem,calc(100%-2rem))]">
          <DialogTitle>Jeste li sigurni?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Termin će biti označen kao „Nije došao“.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmNoShow(false)}>
              Odustani
            </Button>
            <form action={noShowAction}>
              <input type="hidden" name="termin" value={appointmentId} />
              <input type="hidden" name="status" value="no_show" />
              <Button type="submit" variant="outline" disabled={busy}>
                {noShowPending ? "Označavam…" : "Potvrdi"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
