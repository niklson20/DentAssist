"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";

import { pairCurrentDevice, revokeClinicDevice } from "./actions";
import type { ClinicDeviceView } from "./load-devices";

const fieldClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("sr-Latn-RS", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DevicesPage({
  devices,
  thisBrowserLinked,
}: {
  devices: ClinicDeviceView[];
  thisBrowserLinked: boolean;
}) {
  const activeDevices = devices.filter((device) => device.revokedAt === null);

  return (
    <div className="flex flex-col gap-8">
      <PairSection thisBrowserLinked={thisBrowserLinked} />
      <DeviceList devices={devices} activeCount={activeDevices.length} />
    </div>
  );
}

function PairSection({ thisBrowserLinked }: { thisBrowserLinked: boolean }) {
  const [result, formAction, pending] = useActionState<
    ActionResult<{ paired: true }> | null,
    FormData
  >(pairCurrentDevice, null);
  const error = result && !result.ok ? result : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Poveži ovaj računar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Otvorite ovu stranicu na recepcijskom računaru i povežite ga da osoblje može da se prijavi
        PIN-om.
      </p>
      {thisBrowserLinked ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Ovaj računar je povezan. Novo povezivanje zamenjuje prethodnu vezu na ovom uređaju.
        </p>
      ) : null}
      <form action={formAction} className="mt-4 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="device-label" className="text-sm font-medium">Naziv</label>
          <Input
            id="device-label"
            name="label"
            className={fieldClass}
            placeholder="npr. Recepcija"
            autoComplete="off"
            aria-describedby={error?.fieldErrors?.label?.[0] ? "device-label-error" : undefined}
          />
          {error?.fieldErrors?.label?.[0] ? (
            <p id="device-label-error" className="text-sm text-destructive">
              {error.fieldErrors.label[0]}
            </p>
          ) : null}
        </div>
        {error && !error.fieldErrors?.label ? (
          <p role="alert" className="text-sm text-destructive">{error.error}</p>
        ) : null}
        {result?.ok ? (
          <p className="text-sm" role="status">Računar je povezan.</p>
        ) : null}
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Povezivanje…" : "Poveži računar"}
        </Button>
      </form>
    </section>
  );
}

function DeviceList({
  devices,
  activeCount,
}: {
  devices: ClinicDeviceView[];
  activeCount: number;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-semibold">Povezani računari</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {activeCount === 0
          ? "Nema aktivnih recepcijskih računara."
          : `Aktivnih računara: ${activeCount}.`}
      </p>
      {devices.length === 0 ? null : (
        <ul className="mt-4 flex flex-col gap-3">
          {devices.map((device) => (
            <DeviceRow key={device.id} device={device} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DeviceRow({ device }: { device: ClinicDeviceView }) {
  const [result, formAction, pending] = useActionState<
    ActionResult<{ revoked: true }> | null,
    FormData
  >(revokeClinicDevice, null);
  const error = result && !result.ok ? result : null;
  const active = device.revokedAt === null;

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{device.label}</p>
        <p className="text-sm text-muted-foreground">
          {active ? "Aktivan" : "Isključen"} · {formatDate(device.createdAt)}
        </p>
        {error ? <p role="alert" className="mt-1 text-sm text-destructive">{error.error}</p> : null}
        {result?.ok ? (
          <p className="mt-1 text-sm" role="status">Računar je isključen.</p>
        ) : null}
      </div>
      {active ? (
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="deviceId" value={device.id} />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Isključivanje…" : "Isključi"}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
