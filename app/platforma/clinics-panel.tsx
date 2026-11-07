"use client";

import { useActionState, useMemo, useState } from "react";

import { PencilSimple } from "@phosphor-icons/react";

import {
  enableClinicAccess,
  suspendClinicAccess,
  updatePlatformClinicDetails,
  type PlatformClinicRow,
} from "@/app/actions/platform";
import { formatPlatformClinicStatus } from "@/app/platforma/clinic-label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ActionResult } from "@/lib/action-result";
import { memberRoleLabels, type ClinicStatus } from "@/lib/labels";

type StatusFilter = "all" | ClinicStatus;

const textareaClass =
  "min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function ClinicsPanel({ clinics }: { clinics: PlatformClinicRow[] }) {
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const normalizedQuery = normalizeForSearch(query.trim());

  const filteredClinics = useMemo(
    () =>
      clinics.filter((clinic) => {
        const matchesQuery =
          normalizedQuery.length === 0 ||
          normalizeForSearch(`${clinic.name} ${clinic.city}`).includes(normalizedQuery);
        const matchesStatus = statusFilter === "all" || clinic.status === statusFilter;
        return matchesQuery && matchesStatus;
      }),
    [clinics, normalizedQuery, statusFilter],
  );

  const selectedClinic = clinics.find((clinic) => clinic.id === selectedClinicId) ?? null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Pretraži po nazivu ili gradu</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="10.8" cy="10.8" r="6.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Pretraži ordinacije"
            className="pl-9"
          />
        </label>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label="Filtriraj ordinacije po statusu"
          >
            <option value="all">Sve</option>
            <option value="active">Aktivne</option>
            <option value="disabled">Pauzirane</option>
          </select>
        </label>
      </div>

      {filteredClinics.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-5 py-10 text-center">
          <p className="font-medium">
            {clinics.length === 0 ? "Nema registrovanih ordinacija." : "Nema rezultata pretrage."}
          </p>
          {clinics.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Promeni tekst pretrage ili izabrani status.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {filteredClinics.map((clinic) => (
            <li key={clinic.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setSelectedClinicId(clinic.id)}
                aria-haspopup="dialog"
                aria-expanded={selectedClinicId === clinic.id}
                className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="size-5">
                      <path
                        d="M3.5 20.5h17M5.5 20V8.5L12 4l6.5 4.5V20M9 20v-5h6v5M9 10h.01M15 10h.01"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{clinic.name}</span>
                    <span className="mt-1 block truncate text-sm text-muted-foreground">{clinic.city}</span>
                  </span>
                </span>
                <span className="flex items-center justify-between gap-4 pl-[3.25rem] sm:pl-0">
                  <span className="text-sm text-muted-foreground">
                    Nalozi: {clinic.members.length}
                  </span>
                  <ClinicStatusPill status={clinic.status} />
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="size-4 shrink-0 text-muted-foreground"
                  >
                    <path d="m7.5 4.5 5 5.5-5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={selectedClinic !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedClinicId(null);
          }
        }}
      >
        {selectedClinic ? (
          <SheetContent
            side="right"
            className="w-full gap-0 overflow-hidden p-0 sm:max-w-xl"
          >
            <ClinicDetails key={`${selectedClinic.id}:${selectedClinic.name}`} clinic={selectedClinic} />
          </SheetContent>
        ) : null}
      </Sheet>
    </>
  );
}

function ClinicDetails({ clinic }: { clinic: PlatformClinicRow }) {
  return (
    <>
      <SheetHeader className="shrink-0 border-b border-border bg-popover px-5 py-5 pr-16 sm:px-6 sm:pr-16">
        <div className="flex flex-wrap items-center gap-3">
          <SheetTitle className="min-w-0 flex-1 truncate text-xl">{clinic.name}</SheetTitle>
          <ClinicStatusPill status={clinic.status} />
        </div>
        <SheetDescription>
          {clinic.city} <span aria-hidden="true">·</span> Nalozi: {clinic.members.length}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        <ClinicProfileEditor clinic={clinic} />
        <ClinicAccounts clinic={clinic} />
        <ClinicAccessManager clinic={clinic} />
      </div>
    </>
  );
}

function ClinicProfileEditor({ clinic }: { clinic: PlatformClinicRow }) {
  const [editing, setEditing] = useState(false);
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    async (previous, formData) => {
      const next = await updatePlatformClinicDetails(previous, formData);
      if (next.ok) {
        setEditing(false);
      }
      return next;
    },
    null,
  );
  const validation = result && !result.ok ? result : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="clinic-details-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id="clinic-details-heading" className="font-semibold">Podaci ordinacije</h3>
        {!editing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Izmeni podatke ordinacije"
            title="Izmeni podatke"
            onClick={() => setEditing(true)}
          >
            <PencilSimple aria-hidden="true" weight="regular" />
          </Button>
        ) : null}
      </div>

      {result?.ok ? (
        <p className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground" role="status">
          Podaci ordinacije su sačuvani.
        </p>
      ) : null}
      {editing && validation ? (
        <p className="mb-4 text-sm text-destructive" role="alert">{validation.error}</p>
      ) : null}

      {editing ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="clinicId" value={clinic.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Naziv" name="name" value={clinic.name} error={validation?.fieldErrors?.name?.[0]} />
            <DetailField label="Grad" name="city" value={clinic.city} error={validation?.fieldErrors?.city?.[0]} />
            <DetailField
              label="Adresa"
              name="address"
              value={clinic.address}
              error={validation?.fieldErrors?.address?.[0]}
            />
            <DetailField label="Telefon" name="phone" value={clinic.phone} error={validation?.fieldErrors?.phone?.[0]} />
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setEditing(false)}>
              Odustani
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Čuvanje…" : "Sačuvaj"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <DetailValue label="Naziv" value={clinic.name} />
          <DetailValue label="Grad" value={clinic.city} />
          <DetailValue label="Adresa" value={clinic.address} />
          <DetailValue label="Telefon" value={clinic.phone} />
        </div>
      )}
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function DetailField({
  label,
  name,
  value,
  error,
}: {
  label: string;
  name: string;
  value: string;
  error?: string;
}) {
  const id = `clinic-${name}`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input id={id} name={name} defaultValue={value} aria-invalid={error ? true : undefined} required />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ClinicAccounts({ clinic }: { clinic: PlatformClinicRow }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="clinic-accounts-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 id="clinic-accounts-heading" className="font-semibold">Nalozi</h3>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {clinic.members.length}
        </span>
      </div>

      {clinic.members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nema povezanih naloga.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {clinic.members.map((member, index) => (
            <li key={`${member.firstName}-${member.lastName}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1">
              <span className="min-w-0 truncate text-sm font-medium">
                {member.firstName} {member.lastName}
              </span>
              <span className="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                {memberRoleLabels[member.role]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClinicAccessManager({ clinic }: { clinic: PlatformClinicRow }) {
  const [suspendResult, suspendAction, suspendPending] = useActionState<
    ActionResult<{
      disabled: true;
      notificationStatus: "not_requested" | "sent" | "failed";
    }> | null,
    FormData
  >(suspendClinicAccess, null);
  const [enableResult, enableAction, enablePending] = useActionState<
    ActionResult<{ enabled: true }> | null,
    FormData
  >(enableClinicAccess, null);
  const [notifyOwner, setNotifyOwner] = useState(false);
  const suspendError = suspendResult && !suspendResult.ok ? suspendResult : null;
  const enableError = enableResult && !enableResult.ok ? enableResult : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="clinic-access-heading">
      <div className="mb-4">
        <h3 id="clinic-access-heading" className="font-semibold">Pristup ordinaciji</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pauziranje onemogućava prijavu svim nalozima ove ordinacije.
        </p>
      </div>

      {clinic.status === "active" ? (
        <form action={suspendAction} className="space-y-4">
          <input type="hidden" name="clinicId" value={clinic.id} />
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              name="notifyOwner"
              checked={notifyOwner}
              onChange={(event) => setNotifyOwner(event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium">Pošalji mejl vlasniku</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Mejl se šalje vlasniku na adresu povezanu sa njegovim nalogom.
              </span>
            </span>
          </label>

          {notifyOwner ? (
            <div className="space-y-1.5">
              <label htmlFor="owner-suspension-message" className="text-sm font-medium">
                Tekst mejla
              </label>
              <textarea
                id="owner-suspension-message"
                name="ownerMessage"
                defaultValue={defaultSuspensionMessage(clinic.name)}
                maxLength={5000}
                required
                className={textareaClass}
                aria-invalid={suspendError?.fieldErrors?.ownerMessage ? true : undefined}
              />
              {suspendError?.fieldErrors?.ownerMessage?.[0] ? (
                <p className="text-xs text-destructive">{suspendError.fieldErrors.ownerMessage[0]}</p>
              ) : null}
            </div>
          ) : null}

          {suspendError ? <p className="text-sm text-destructive" role="alert">{suspendError.error}</p> : null}
          <Button type="submit" variant="destructive" className="w-full" disabled={suspendPending}>
            {suspendPending ? "Pauziranje…" : "Pauziraj pristup"}
          </Button>
        </form>
      ) : (
        <form action={enableAction} className="space-y-4">
          <input type="hidden" name="clinicId" value={clinic.id} />
          {enableError ? <p className="text-sm text-destructive" role="alert">{enableError.error}</p> : null}
          <Button type="submit" className="w-full" disabled={enablePending}>
            {enablePending ? "Uključivanje…" : "Ponovo uključi pristup"}
          </Button>
        </form>
      )}

      {clinic.status === "disabled" && suspendResult?.ok ? (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-foreground" role="status">
          {suspendResult.data.notificationStatus === "sent"
            ? "Pristup je pauziran, a mejl je poslat vlasniku."
            : suspendResult.data.notificationStatus === "failed"
              ? "Pristup je pauziran, ali mejl nije poslat vlasniku. Proveri adresu vlasnika i podešavanja mejla."
              : "Pristup ordinaciji je pauziran."}
        </p>
      ) : null}
      {clinic.status === "active" && enableResult?.ok ? (
        <p className="mt-3 rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground" role="status">
          Pristup ordinaciji je ponovo uključen.
        </p>
      ) : null}
    </section>
  );
}

function ClinicStatusPill({ status }: { status: ClinicStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        status === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"
      }`}
    >
      <span className={`size-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
      {formatPlatformClinicStatus(status)}
    </span>
  );
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sr-Latn");
}

function defaultSuspensionMessage(clinicName: string): string {
  return `Poštovani,\n\nPristup ordinaciji ${clinicName} je privremeno pauziran. Ako su vam potrebne dodatne informacije, odgovorite na ovu poruku.\n\nSrdačan pozdrav,\nDentAssist`;
}
