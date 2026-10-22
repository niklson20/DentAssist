"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { memberRoleLabels } from "@/lib/labels";

import {
  sendStaffInvite,
  setMemberListedOnline,
  setMemberUnavailable,
  transferClinicOwnership,
} from "./actions";
import type { PendingStaffInviteView, StaffMemberView } from "./load-staff";

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

export function StaffPage({
  ownerMemberId,
  ownerPinSet,
  soleOwner,
  members,
  pendingInvites,
}: {
  ownerMemberId: string;
  ownerPinSet: boolean;
  soleOwner: boolean;
  members: StaffMemberView[];
  pendingInvites: PendingStaffInviteView[];
}) {
  const transferTargets = members.filter(
    (member) => member.id !== ownerMemberId && member.role !== "owner" && !member.unavailable,
  );

  return (
    <div className="flex flex-col gap-8">
      <InviteSection pinSet={ownerPinSet} />
      {pendingInvites.length > 0 ? <PendingInvitesSection invites={pendingInvites} /> : null}
      <MembersSection
        ownerMemberId={ownerMemberId}
        soleOwner={soleOwner}
        members={members}
        transferTargets={transferTargets}
      />
    </div>
  );
}

function InviteSection({ pinSet }: { pinSet: boolean }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ sent: true }> | null, FormData>(
    sendStaffInvite,
    null,
  );
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Pozivnica</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Kolega dobija mejl sa linkom i kodom od 6 cifara. Pozivnica važi 7 dana.
      </p>
      {!pinSet ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Pre prve pozivnice postavite PIN na stranici{" "}
          <Link href="/podesavanja/nalog" className="text-foreground underline underline-offset-4">
            Nalog
          </Link>
          .
        </p>
      ) : null}
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ime" name="firstName" error={error?.fieldErrors?.firstName?.[0]} />
          <Field label="Prezime" name="lastName" error={error?.fieldErrors?.lastName?.[0]} />
        </div>
        <Field label="Mejl" name="email" type="email" error={error?.fieldErrors?.email?.[0]} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium">Uloga</label>
          <select id="role" name="role" className={fieldClass} defaultValue="dentist">
            <option value="dentist">Stomatolog</option>
            <option value="reception">Recepcija</option>
          </select>
          {error?.fieldErrors?.role?.[0] ? (
            <p className="text-sm text-destructive">{error.fieldErrors.role[0]}</p>
          ) : null}
        </div>
        {error?.fieldErrors?.pin?.[0] ? (
          <p role="alert" className="text-sm text-destructive">{error.fieldErrors.pin[0]}</p>
        ) : null}
        {error && !error.fieldErrors?.firstName && !error.fieldErrors?.lastName && !error.fieldErrors?.email && !error.fieldErrors?.role && !error.fieldErrors?.pin ? (
          <p role="alert" className="text-sm text-destructive">{error.error}</p>
        ) : null}
        {result?.ok ? (
          <p className="text-sm" role="status">Pozivnica je poslata.</p>
        ) : null}
        <Button type="submit" disabled={pending || !pinSet} className="self-start">
          {pending ? "Slanje u toku…" : "Pošalji pozivnicu"}
        </Button>
      </form>
    </section>
  );
}

function PendingInvitesSection({ invites }: { invites: PendingStaffInviteView[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Pozivnice na čekanju</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {invites.map((invite) => (
          <li key={invite.id} className="text-sm">
            <p className="font-medium">
              {invite.firstName} {invite.lastName} — {memberRoleLabels[invite.role].toLowerCase()}
            </p>
            <p className="text-muted-foreground">{invite.email}</p>
            <p className="text-muted-foreground">Važi do {formatDate(invite.expiresAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MembersSection({
  ownerMemberId,
  soleOwner,
  members,
  transferTargets,
}: {
  ownerMemberId: string;
  soleOwner: boolean;
  members: StaffMemberView[];
  transferTargets: StaffMemberView[];
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Članovi</h2>
      <ul className="mt-4 flex flex-col gap-4">
        {members.map((member) => (
          <li key={member.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {member.firstName} {member.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{memberRoleLabels[member.role]}</p>
            </div>
            {member.unavailable ? (
              <p className="mt-1 text-sm text-muted-foreground">Nedostupan</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <UnavailableToggle
                member={member}
                disabled={soleOwner && member.id === ownerMemberId && !member.unavailable}
              />
              {member.seesPatients ? (
                <ListedToggle member={member} />
              ) : null}
            </div>
            {soleOwner && member.id === ownerMemberId && !member.unavailable ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Poslednji vlasnik ne može biti nedostupan dok ulogu ne preda drugom članu.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {soleOwner && transferTargets.length > 0 ? (
        <TransferOwnershipForm targets={transferTargets} />
      ) : null}
    </section>
  );
}

function UnavailableToggle({ member, disabled }: { member: StaffMemberView; disabled: boolean }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    setMemberUnavailable,
    null,
  );
  const nextUnavailable = !member.unavailable;

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="unavailable" value={nextUnavailable ? "true" : "false"} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || disabled}>
        {pending ? "Čuvanje…" : member.unavailable ? "Vrati dostupnost" : "Označi nedostupnim"}
      </Button>
      {result && !result.ok ? (
        <p className="mt-1 text-sm text-destructive" role="alert">{result.error}</p>
      ) : null}
    </form>
  );
}

function ListedToggle({ member }: { member: StaffMemberView }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    setMemberListedOnline,
    null,
  );
  const nextListed = !member.listedOnline;

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="memberId" value={member.id} />
      <input type="hidden" name="listedOnline" value={nextListed ? "true" : "false"} />
      <Button type="submit" variant="outline" size="sm" disabled={pending || member.unavailable}>
        {pending
          ? "Čuvanje…"
          : member.listedOnline
            ? "Skloni sa javne strane"
            : "Prikaži na javnoj strani"}
      </Button>
      {result && !result.ok ? (
        <p className="mt-1 text-sm text-destructive" role="alert">{result.error}</p>
      ) : null}
    </form>
  );
}

function TransferOwnershipForm({ targets }: { targets: StaffMemberView[] }) {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    transferClinicOwnership,
    null,
  );

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-3 border-t border-border pt-4" noValidate>
      <h3 className="text-base font-semibold">Predaja uloge vlasnika</h3>
      <p className="text-sm text-muted-foreground">
        Izaberite kolegu koji preuzima vlasništvo. Vi ostajete u ordinaciji kao stomatolog ili recepcija.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="targetMemberId" className="text-sm font-medium">Novi vlasnik</label>
        <select id="targetMemberId" name="targetMemberId" className={fieldClass} defaultValue="">
          <option value="" disabled>Izaberite člana</option>
          {targets.map((member) => (
            <option key={member.id} value={member.id}>
              {member.firstName} {member.lastName} ({memberRoleLabels[member.role]})
            </option>
          ))}
        </select>
        {result && !result.ok && result.fieldErrors?.targetMemberId?.[0] ? (
          <p className="text-sm text-destructive">{result.fieldErrors.targetMemberId[0]}</p>
        ) : null}
      </div>
      {result && !result.ok && !result.fieldErrors?.targetMemberId ? (
        <p role="alert" className="text-sm text-destructive">{result.error}</p>
      ) : null}
      {result?.ok ? (
        <p className="text-sm" role="status">Uloga vlasnika je predata.</p>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Čuvanje u toku…" : "Predaj ulogu vlasnika"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  error,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
}) {
  const id = name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <Input
        id={id}
        name={name}
        type={type}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("sr-Latn-RS", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Belgrade",
  });
}
