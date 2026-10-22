"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import {
  addAppointmentType,
  deactivateAppointmentType,
  renameAppointmentType,
  setDefaultAppointmentType,
} from "./actions";
import type { AppointmentTypeView } from "./load-appointment-types";

export function AppointmentTypesPage({
  types,
  defaultTypeId,
}: {
  types: AppointmentTypeView[];
  defaultTypeId: string | null;
}) {
  const activeTypes = types.filter((type) => type.active);
  const inactiveTypes = types.filter((type) => !type.active);

  return (
    <div className="flex flex-col gap-8">
      <AddTypeSection />
      {activeTypes.length > 0 ? (
        <ActiveTypesSection types={activeTypes} defaultTypeId={defaultTypeId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Još nema tipova termina. Dodajte prvi tip iznad.
        </p>
      )}
      {inactiveTypes.length > 0 ? <InactiveTypesSection types={inactiveTypes} /> : null}
    </div>
  );
}

function AddTypeSection() {
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    addAppointmentType,
    null,
  );
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Novi tip</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Online zakazivanje koristi podrazumevani tip i podrazumevano trajanje ordinacije.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="add-type-name" className="text-sm font-medium">Naziv</label>
          <Input id="add-type-name" name="name" required maxLength={100} disabled={pending} />
          {error?.fieldErrors?.name?.[0] ? (
            <p className="text-sm text-destructive">{error.fieldErrors.name[0]}</p>
          ) : null}
        </div>
        {error && !error.fieldErrors?.name ? (
          <p role="alert" className="text-sm text-destructive sm:col-span-2">{error.error}</p>
        ) : null}
        {result?.ok ? <p className="text-sm sm:col-span-2" role="status">Tip je dodat.</p> : null}
        <Button type="submit" disabled={pending} className="shrink-0 self-start sm:self-end">
          Dodaj tip
        </Button>
      </form>
    </section>
  );
}

function ActiveTypesSection({
  types,
  defaultTypeId,
}: {
  types: AppointmentTypeView[];
  defaultTypeId: string | null;
}) {
  const [defaultResult, defaultAction, defaultPending] = useActionState<
    ActionResult<{ saved: true }> | null,
    FormData
  >(setDefaultAppointmentType, null);
  const defaultError = defaultResult && !defaultResult.ok ? defaultResult : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Aktivni tipovi</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Podrazumevani tip koristi online zakazivanje. Stari termini zadržavaju ugašeni tip.
      </p>

      <form action={defaultAction} className="mt-4 flex flex-col gap-4">
        <fieldset className="flex flex-col gap-3" disabled={defaultPending}>
          <legend className="text-sm font-medium">Podrazumevani tip</legend>
          {types.map((type) => (
            <label key={type.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="typeId"
                value={type.id}
                defaultChecked={type.id === defaultTypeId}
                className="size-4 border-input text-primary"
              />
              <span>{type.name}</span>
            </label>
          ))}
        </fieldset>
        {defaultError ? (
          <p role="alert" className="text-sm text-destructive">{defaultError.error}</p>
        ) : null}
        {defaultResult?.ok ? (
          <p className="text-sm" role="status">Podrazumevani tip je sačuvan.</p>
        ) : null}
        <Button type="submit" disabled={defaultPending} className="self-start">
          Sačuvaj podrazumevani
        </Button>
      </form>

      <ul className="mt-8 flex flex-col gap-6 border-t border-border pt-6">
        {types.map((type) => (
          <li key={type.id}>
            <TypeRow type={type} isDefault={type.id === defaultTypeId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TypeRow({ type, isDefault }: { type: AppointmentTypeView; isDefault: boolean }) {
  const [renameResult, renameAction, renamePending] = useActionState<
    ActionResult<{ saved: true }> | null,
    FormData
  >(renameAppointmentType, null);
  const [deactivateResult, deactivateAction, deactivatePending] = useActionState<
    ActionResult<{ saved: true }> | null,
    FormData
  >(deactivateAppointmentType, null);

  const renameError = renameResult && !renameResult.ok ? renameResult : null;
  const deactivateError = deactivateResult && !deactivateResult.ok ? deactivateResult : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{type.name}</span>
        {isDefault ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Podrazumevani
          </span>
        ) : null}
      </div>

      <form action={renameAction} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <input type="hidden" name="typeId" value={type.id} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={`rename-${type.id}`} className="text-sm font-medium">Preimenuj</label>
          <Input
            id={`rename-${type.id}`}
            name="name"
            defaultValue={type.name}
            maxLength={100}
            disabled={renamePending}
          />
          {renameError?.fieldErrors?.name?.[0] ? (
            <p className="text-sm text-destructive">{renameError.fieldErrors.name[0]}</p>
          ) : null}
        </div>
        {renameError && !renameError.fieldErrors?.name ? (
          <p role="alert" className="text-sm text-destructive">{renameError.error}</p>
        ) : null}
        {renameResult?.ok ? <p className="text-sm" role="status">Naziv je sačuvan.</p> : null}
        <Button type="submit" variant="secondary" disabled={renamePending} className="shrink-0 self-start">
          Sačuvaj naziv
        </Button>
      </form>

      <form action={deactivateAction}>
        <input type="hidden" name="typeId" value={type.id} />
        {deactivateError ? (
          <p role="alert" className="mb-2 text-sm text-destructive">{deactivateError.error}</p>
        ) : null}
        {deactivateResult?.ok ? (
          <p className="mb-2 text-sm" role="status">Tip je ugašen.</p>
        ) : null}
        <Button
          type="submit"
          variant="outline"
          disabled={deactivatePending || isDefault}
          className="text-destructive hover:text-destructive"
        >
          Ugasi tip
        </Button>
      </form>
    </div>
  );
}

function InactiveTypesSection({ types }: { types: AppointmentTypeView[] }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Ugašeni tipovi</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ne nude se za nove termine, ali ostaju na starim.</p>
      <ul className="mt-4 flex flex-col gap-2">
        {types.map((type) => (
          <li key={type.id} className="text-sm text-muted-foreground">
            {type.name}
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs">Ugašen</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
