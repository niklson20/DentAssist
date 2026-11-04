"use client";

import { useActionState, useEffect, useRef } from "react";

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
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_16rem] md:items-start md:gap-6">
      <div className="md:order-2 md:sticky md:top-4">
        <AddTypeSection />
      </div>
      <div className="min-w-0 md:order-1">
        <TypesListCard
          activeTypes={activeTypes}
          inactiveTypes={inactiveTypes}
          defaultTypeId={defaultTypeId}
        />
      </div>
    </div>
  );
}

function AddTypeSection() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, pending] = useActionState<ActionResult<{ saved: true }> | null, FormData>(
    addAppointmentType,
    null,
  );
  const error = result && !result.ok ? result : null;

  useEffect(() => {
    if (result?.ok) {
      formRef.current?.reset();
    }
  }, [result]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Dodaj tip</h2>
      <form ref={formRef} action={formAction} className="mt-3 flex flex-col gap-3" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-type-name" className="sr-only">
            Naziv tipa termina
          </label>
          <Input
            id="add-type-name"
            name="name"
            required
            maxLength={100}
            disabled={pending}
            placeholder="npr. Pregled"
          />
          {error?.fieldErrors?.name?.[0] ? (
            <p className="text-sm text-destructive">{error.fieldErrors.name[0]}</p>
          ) : null}
        </div>
        {error && !error.fieldErrors?.name ? (
          <p role="alert" className="text-sm text-destructive">
            {error.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} className="w-full">
          Dodaj
        </Button>
        {result?.ok ? (
          <p className="text-sm" role="status">
            Tip je dodat.
          </p>
        ) : null}
      </form>
    </section>
  );
}

function TypesListCard({
  activeTypes,
  inactiveTypes,
  defaultTypeId,
}: {
  activeTypes: AppointmentTypeView[];
  inactiveTypes: AppointmentTypeView[];
  defaultTypeId: string | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Aktivni tipovi</h2>

      {activeTypes.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-6">
          {activeTypes.map((type) => (
            <li key={type.id} className="border-b border-border pb-6 last:border-b-0 last:pb-0">
              <TypeRow type={type} isDefault={type.id === defaultTypeId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          <span className="md:hidden">Još nema tipova termina. Dodajte prvi tip iznad.</span>
          <span className="hidden md:inline">Još nema tipova termina. Dodajte prvi tip desno.</span>
        </p>
      )}

      {inactiveTypes.length > 0 ? <InactiveTypesSubsection types={inactiveTypes} /> : null}
    </section>
  );
}

function SetDefaultTypeButton({ typeId }: { typeId: string }) {
  const [result, formAction, pending] = useActionState<
    ActionResult<{ saved: true }> | null,
    FormData
  >(setDefaultAppointmentType, null);
  const error = result && !result.ok ? result : null;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="typeId" value={typeId} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.error}
        </p>
      ) : null}
      {result?.ok ? (
        <p className="text-sm" role="status">
          Podrazumevani tip je sačuvan.
        </p>
      ) : null}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Postavi kao podrazumevani
      </Button>
    </form>
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{type.name}</span>
          {isDefault ? (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Podrazumevani
            </span>
          ) : null}
        </div>
        {!isDefault ? <SetDefaultTypeButton typeId={type.id} /> : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <form action={renameAction} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end" noValidate>
          <input type="hidden" name="typeId" value={type.id} />
          <div className="min-w-0 flex-1">
            <label htmlFor={`rename-${type.id}`} className="sr-only">
              Preimenuj
            </label>
            <Input
              id={`rename-${type.id}`}
              name="name"
              defaultValue={type.name}
              maxLength={100}
              disabled={renamePending}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={renamePending}
            className="shrink-0 self-start sm:self-auto"
          >
            Sačuvaj naziv
          </Button>
        </form>

        <form action={deactivateAction} className="shrink-0 self-start sm:self-auto">
          <input type="hidden" name="typeId" value={type.id} />
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

      {renameError?.fieldErrors?.name?.[0] ? (
        <p className="text-sm text-destructive">{renameError.fieldErrors.name[0]}</p>
      ) : null}
      {renameError && !renameError.fieldErrors?.name ? (
        <p role="alert" className="text-sm text-destructive">
          {renameError.error}
        </p>
      ) : null}
      {renameResult?.ok ? (
        <p className="text-sm" role="status">
          Naziv je sačuvan.
        </p>
      ) : null}
      {deactivateError ? (
        <p role="alert" className="text-sm text-destructive">
          {deactivateError.error}
        </p>
      ) : null}
      {deactivateResult?.ok ? (
        <p className="text-sm" role="status">
          Tip je ugašen.
        </p>
      ) : null}
    </div>
  );
}

function InactiveTypesSubsection({ types }: { types: AppointmentTypeView[] }) {
  return (
    <div className="mt-6 border-t border-border pt-6">
      <h3 className="text-sm font-medium">Ugašeni tipovi</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Ne nude se za nove termine, ali ostaju na starim.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {types.map((type) => (
          <li key={type.id} className="text-sm text-muted-foreground">
            {type.name}
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs">Ugašen</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
