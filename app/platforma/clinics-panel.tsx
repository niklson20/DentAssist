"use client";

import { useActionState, useOptimistic, useTransition } from "react";

import { disableClinicAccess, type PlatformClinicRow } from "@/app/actions/platform";
import {
  formatPlatformClinicMember,
  formatPlatformClinicStatus,
} from "@/app/platforma/clinic-label";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

type Props = {
  clinics: PlatformClinicRow[];
};

export function ClinicsPanel({ clinics }: Props) {
  const [optimisticClinics, markDisabled] = useOptimistic(
    clinics,
    (state, clinicId: string) =>
      state.map((clinic) =>
        clinic.id === clinicId ? { ...clinic, status: "disabled" as const } : clinic,
      ),
  );

  if (optimisticClinics.length === 0) {
    return <p className="text-sm text-muted-foreground">Nema registrovanih ordinacija.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {optimisticClinics.map((clinic) => (
        <ClinicRow key={clinic.id} clinic={clinic} onDisable={markDisabled} />
      ))}
    </ul>
  );
}

function ClinicRow({
  clinic,
  onDisable,
}: {
  clinic: PlatformClinicRow;
  onDisable: (clinicId: string) => void;
}) {
  const [, startTransition] = useTransition();
  const [result, formAction, pending] = useActionState<
    ActionResult<{ disabled: true }> | null,
    FormData
  >(disableClinicAccess, null);

  const members =
    clinic.members.length > 0
      ? clinic.members.map(formatPlatformClinicMember).join(", ")
      : "—";

  return (
    <li className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">{clinic.name}</p>
        <p className="text-sm text-muted-foreground">{clinic.city}</p>
        <p className="text-sm">
          <span className="text-muted-foreground">Status: </span>
          {formatPlatformClinicStatus(clinic.status)}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">Nalozi: </span>
          {members}
        </p>
        {result && !result.ok ? (
          <p className="text-sm text-destructive" role="alert">
            {result.error}
          </p>
        ) : null}
      </div>
      {clinic.status === "active" ? (
        <form
          action={formAction}
          onSubmit={() => {
            startTransition(() => {
              onDisable(clinic.id);
            });
          }}
        >
          <input type="hidden" name="clinicId" value={clinic.id} />
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>
            {pending ? "Gašenje…" : "Ugasi pristup"}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
