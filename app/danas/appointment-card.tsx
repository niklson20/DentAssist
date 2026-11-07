"use client";

import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { PencilSimple } from "@phosphor-icons/react";

import { loadAppointmentDetails } from "@/app/actions/appointment-details";
import { setAppointmentStatus } from "@/app/actions/appointments";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { appointmentStatusLabel } from "@/lib/labels";
import { AppointmentForm } from "./appointment-form";

type AppointmentDetails = NonNullable<Awaited<ReturnType<typeof loadAppointmentDetails>>>;

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
  const closeDialog = useCallback(() => {
    setOpen(false);
    setEditing(false);
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
          {details ? <AppointmentDetailsPanel details={details} editing={editing} onCancelled={closeDialog} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppointmentDetailsPanel({
  details,
  editing,
  onCancelled,
}: {
  details: AppointmentDetails;
  editing: boolean;
  onCancelled: () => void;
}) {
  const { appointment, patient, dentistName, typeName, status, cancellationNote, choices } = details;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-medium">Pacijent</dt>
        <dd className="flex items-center gap-2">
          <span>{patient.name}</span>
          <Link href={patient.href} className={buttonVariants({ variant: "outline", size: "xs" })}>Karton</Link>
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
      {status === "scheduled" ? <CancelAppointmentForm appointmentId={appointment.id} onCancelled={onCancelled} /> : null}
    </div>
  );
}

function CancelAppointmentForm({ appointmentId, onCancelled }: { appointmentId: string; onCancelled: () => void }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    setAppointmentStatus,
    null,
  );

  useEffect(() => {
    if (result?.ok) onCancelled();
  }, [onCancelled, result]);

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border pt-4">
      <input type="hidden" name="termin" value={appointmentId} />
      <input type="hidden" name="status" value="cancelled" />
      <label htmlFor={`cancel-note-${appointmentId}`} className="text-sm font-medium">Razlog otkazivanja</label>
      <textarea
        id={`cancel-note-${appointmentId}`}
        name="poruka"
        required
        maxLength={300}
        className="min-h-20 rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
      />
      {result?.ok ? <p role="status" className="text-sm">Termin je otkazan.</p> : null}
      {result && !result.ok ? <p role="alert" className="text-sm text-destructive">{result.error}</p> : null}
      <Button type="submit" variant="destructive" disabled={pending} className="self-start">
        {pending ? "Otkazujem…" : "Otkaži termin"}
      </Button>
    </form>
  );
}
