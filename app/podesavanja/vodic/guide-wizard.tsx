"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { sendStaffInvite } from "@/app/podesavanja/osoblje/actions";
import {
  defaultDaySchedule,
  ISO_DOW_LABELS,
  ISO_DOW_ORDER,
  type DayScheduleView,
} from "@/app/podesavanja/radno-vreme/schema";
import { durationOptionsForSlot } from "@/app/podesavanja/ordinacija/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import {
  acceptGuideTerms,
  advanceGuideInvite,
  completeGuideSetup,
  saveGuideNotice,
  saveGuideProfile,
  saveGuideScheduling,
  saveGuideSeesPatients,
  saveGuideWorkingHours,
} from "./actions";
import type { GuideClinicView } from "./load-guide";
import type { GuideStep } from "./steps";
import { GUIDE_TERMS_TEXT } from "./terms";

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

const STEP_LABELS: Record<GuideStep, string> = {
  terms: "Uslovi",
  profile: "Ordinacija",
  sees_patients: "Pacijenti",
  working_hours: "Radno vreme",
  scheduling: "Termini",
  notice: "Najava",
  invite: "Stomatolog",
  online: "Online",
};

export function GuideWizard({
  step,
  clinic,
  ownerMemberId,
  ownerSeesPatients,
  ownerPinSet,
  someoneSeesPatients,
  pendingDentistInvite,
}: {
  step: GuideStep;
  clinic: GuideClinicView;
  ownerMemberId: string;
  ownerSeesPatients: boolean;
  ownerPinSet: boolean;
  someoneSeesPatients: boolean;
  pendingDentistInvite: boolean;
}) {
  const defaultDays = useMemo(
    () => ISO_DOW_ORDER.map((isoDow) => defaultDaySchedule(isoDow)),
    [],
  );

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Podešavanje ordinacije</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Korak: {STEP_LABELS[step]}
        </p>
      </header>

      {step === "terms" ? <TermsStep /> : null}
      {step === "profile" ? <ProfileStep clinic={clinic} /> : null}
      {step === "sees_patients" ? <SeesPatientsStep ownerSeesPatients={ownerSeesPatients} /> : null}
      {step === "working_hours" ? (
        <WorkingHoursStep ownerMemberId={ownerMemberId} days={defaultDays} />
      ) : null}
      {step === "scheduling" ? <SchedulingStep clinic={clinic} /> : null}
      {step === "notice" ? <NoticeStep clinic={clinic} /> : null}
      {step === "invite" ? (
        <InviteStep
          ownerPinSet={ownerPinSet}
          ownerSeesPatients={ownerSeesPatients}
          pendingDentistInvite={pendingDentistInvite}
        />
      ) : null}
      {step === "online" ? (
        <OnlineStep someoneSeesPatients={someoneSeesPatients} />
      ) : null}
    </div>
  );
}

function TermsStep() {
  const [result, formAction, pending] = useActionState(acceptGuideTerms, null);

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Uslovi korišćenja</h2>
      <p className="mt-4 text-sm text-muted-foreground">{GUIDE_TERMS_TEXT}</p>
      <form action={formAction} className="mt-6 flex flex-col gap-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="accepted"
            required
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          Prihvatam uslove
        </label>
        {result && !result.ok ? (
          <p className="text-sm text-destructive" role="alert">{result.error}</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </section>
  );
}

function ProfileStep({ clinic }: { clinic: GuideClinicView }) {
  const [result, formAction, pending] = useActionState(saveGuideProfile, null);
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Podaci ordinacije</h2>
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <Field label="Naziv" name="name" defaultValue={clinic.name} error={error?.fieldErrors?.name?.[0]} />
        <Field label="Grad" name="city" defaultValue={clinic.city} error={error?.fieldErrors?.city?.[0]} />
        <Field
          label="Adresa"
          name="address"
          defaultValue={clinic.address}
          error={error?.fieldErrors?.address?.[0]}
        />
        <Field label="Telefon" name="phone" defaultValue={clinic.phone} error={error?.fieldErrors?.phone?.[0]} />
        {error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">{error.error}</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </section>
  );
}

function SeesPatientsStep({ ownerSeesPatients }: { ownerSeesPatients: boolean }) {
  const [result, formAction, pending] = useActionState(saveGuideSeesPatients, null);
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Da li vi lično primate pacijente?</h2>
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="seesPatients"
            value="true"
            defaultChecked={ownerSeesPatients}
            className="size-4 border-input accent-primary"
          />
          Da, primam pacijente
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="seesPatients"
            value="false"
            defaultChecked={!ownerSeesPatients}
            className="size-4 border-input accent-primary"
          />
          Ne, samo koordiniram ordinaciju
        </label>
        {error?.fieldErrors?.seesPatients?.[0] ? (
          <p className="text-sm text-destructive">{error.fieldErrors.seesPatients[0]}</p>
        ) : null}
        {error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">{error.error}</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </section>
  );
}

function WorkingHoursStep({
  ownerMemberId,
  days,
}: {
  ownerMemberId: string;
  days: DayScheduleView[];
}) {
  const [result, formAction, pending] = useActionState(saveGuideWorkingHours, null);
  const [closedByDay, setClosedByDay] = useState(() =>
    Object.fromEntries(days.map((day) => [day.isoDow, day.isClosed])),
  );
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Vaše radno vreme</h2>
      <p className="mt-1 text-sm text-muted-foreground">Podrazumevano: ponedeljak–petak 09–17, vikend zatvoren.</p>
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <input type="hidden" name="memberId" value={ownerMemberId} />
        <ul className="flex flex-col gap-4">
          {days.map((day) => {
            const closed = closedByDay[day.isoDow] ?? day.isClosed;
            return (
              <li key={day.isoDow} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{ISO_DOW_LABELS[day.isoDow]}</span>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      name={`closed_${day.isoDow}`}
                      value="true"
                      checked={closed}
                      onChange={(event) =>
                        setClosedByDay((current) => ({
                          ...current,
                          [day.isoDow]: event.target.checked,
                        }))
                      }
                      className="size-4 rounded border-input accent-primary"
                    />
                    Zatvoreno
                  </label>
                </div>
                {!closed ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <TimeField label="Od" name={`opens_${day.isoDow}`} defaultValue={day.opensAt} />
                    <TimeField label="Do" name={`closes_${day.isoDow}`} defaultValue={day.closesAt} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">{error.error}</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </section>
  );
}

function SchedulingStep({ clinic }: { clinic: GuideClinicView }) {
  const [result, formAction, pending] = useActionState(saveGuideScheduling, null);
  const [slotMinutes, setSlotMinutes] = useState(clinic.slotMinutes);
  const durationOptions = useMemo(() => durationOptionsForSlot(slotMinutes), [slotMinutes]);
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Tip i trajanje termina</h2>
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <Field
          label="Podrazumevani tip"
          name="typeName"
          defaultValue={clinic.defaultTypeName}
          error={error?.fieldErrors?.typeName?.[0]}
        />
        <SelectField
          label="Korak termina"
          name="slotMinutes"
          value={slotMinutes}
          onChange={(event) => setSlotMinutes(Number(event.target.value) as 15 | 30)}
          error={error?.fieldErrors?.slotMinutes?.[0]}
          options={[
            { value: 15, label: "15 minuta" },
            { value: 30, label: "30 minuta" },
          ]}
        />
        <SelectField
          label="Razmak između termina"
          name="bufferMinutes"
          defaultValue={clinic.bufferMinutes}
          error={error?.fieldErrors?.bufferMinutes?.[0]}
          options={[
            { value: 0, label: "0 minuta" },
            { value: 5, label: "5 minuta" },
            { value: 10, label: "10 minuta" },
            { value: 15, label: "15 minuta" },
          ]}
        />
        <SelectField
          label="Podrazumevano trajanje"
          name="defaultDurationMin"
          defaultValue={clinic.defaultDurationMin}
          error={error?.fieldErrors?.defaultDurationMin?.[0]}
          options={durationOptions.map((minutes) => ({
            value: minutes,
            label: `${minutes} minuta`,
          }))}
        />
        {error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">{error.error}</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </section>
  );
}

function NoticeStep({ clinic }: { clinic: GuideClinicView }) {
  const [result, formAction, pending] = useActionState(saveGuideNotice, null);
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Najava i horizont</h2>
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <Field
          label="Najava (minute pre termina)"
          name="minNoticeMinutes"
          type="number"
          min={0}
          defaultValue={String(clinic.minNoticeMinutes)}
          error={error?.fieldErrors?.minNoticeMinutes?.[0]}
        />
        <Field
          label="Horizont (dana unapred)"
          name="maxAheadDays"
          type="number"
          min={0}
          defaultValue={String(clinic.maxAheadDays)}
          error={error?.fieldErrors?.maxAheadDays?.[0]}
        />
        {error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">{error.error}</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </section>
  );
}

function InviteStep({
  ownerPinSet,
  ownerSeesPatients,
  pendingDentistInvite,
}: {
  ownerPinSet: boolean;
  ownerSeesPatients: boolean;
  pendingDentistInvite: boolean;
}) {
  const [inviteResult, inviteAction, invitePending] = useActionState<
    ActionResult<{ sent: true }> | null,
    FormData
  >(sendStaffInvite, null);
  const [advanceResult, advanceAction, advancePending] = useActionState(advanceGuideInvite, null);
  const inviteError = inviteResult && !inviteResult.ok ? inviteResult : null;
  const canContinue = ownerSeesPatients || pendingDentistInvite || inviteResult?.ok;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold">Pozovite stomatologa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Kolega dobija mejl sa linkom i kodom od 6 cifara. Pozivnica važi 7 dana.
        </p>
        {!ownerPinSet ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Pre prve pozivnice postavite PIN na stranici{" "}
            <Link href="/podesavanja/nalog" className="text-foreground underline underline-offset-4">
              Nalog
            </Link>
            .
          </p>
        ) : null}
        <form action={inviteAction} className="mt-4 flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ime" name="firstName" error={inviteError?.fieldErrors?.firstName?.[0]} />
            <Field label="Prezime" name="lastName" error={inviteError?.fieldErrors?.lastName?.[0]} />
          </div>
          <Field label="Mejl" name="email" type="email" error={inviteError?.fieldErrors?.email?.[0]} />
          <input type="hidden" name="role" value="dentist" />
          {inviteError?.fieldErrors?.pin?.[0] ? (
            <p className="text-sm text-destructive" role="alert">{inviteError.fieldErrors.pin[0]}</p>
          ) : null}
          {inviteError && !inviteError.fieldErrors ? (
            <p className="text-sm text-destructive" role="alert">{inviteError.error}</p>
          ) : null}
          {inviteResult?.ok ? (
            <p className="text-sm" role="status">Pozivnica je poslata.</p>
          ) : null}
          <Button type="submit" disabled={invitePending || !ownerPinSet} className="self-start">
            {invitePending ? "Slanje u toku…" : "Pošalji pozivnicu"}
          </Button>
        </form>
      </section>

      <form action={advanceAction}>
        {advanceResult && !advanceResult.ok ? (
          <p className="mb-2 text-sm text-destructive" role="alert">{advanceResult.error}</p>
        ) : null}
        <Button type="submit" disabled={advancePending || !canContinue} className="self-start">
          {advancePending ? "Čuvanje u toku…" : "Nastavi"}
        </Button>
      </form>
    </div>
  );
}

function OnlineStep({ someoneSeesPatients }: { someoneSeesPatients: boolean }) {
  const [result, formAction, pending] = useActionState(completeGuideSetup, null);
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Online zakazivanje</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Uključeno znači da se ordinacija vidi u imeniku.
      </p>
      {!someoneSeesPatients ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Ovaj korak je dostupan kada neko u ordinaciji prima pacijente.
        </p>
      ) : null}
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="onlineBookingEnabled"
            value="true"
            defaultChecked
            disabled={!someoneSeesPatients}
            className="size-4 border-input accent-primary"
          />
          Uključi online zakazivanje
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="onlineBookingEnabled"
            value="false"
            disabled={!someoneSeesPatients}
            className="size-4 border-input accent-primary"
          />
          Ostavi isključeno
        </label>
        {error && !error.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">{error.error}</p>
        ) : null}
        <Button type="submit" disabled={pending || !someoneSeesPatients} className="self-start">
          {pending ? "Završavanje…" : "Završi podešavanje"}
        </Button>
      </form>
    </section>
  );
}

function TimeField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input id={name} name={name} type="time" defaultValue={defaultValue} className={fieldClass} />
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue = "",
  error,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  type?: string;
  min?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        min={min}
        className={fieldClass}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  value,
  onChange,
  error,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: number;
  value?: number;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  error?: string;
  options: { value: number; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <select
        id={name}
        name={name}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange}
        className={fieldClass}
        aria-invalid={error ? true : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
