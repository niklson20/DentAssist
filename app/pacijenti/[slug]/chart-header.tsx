"use client";

import { useCallback, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { alertCodeLabel, sexLabel, type AlertCode, type Sex } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

import { ChartDetailsForm, chartBirthDateLabel } from "./chart-details-form";

export type ChartHeaderPatient = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  address: string | null;
  note: string | null;
  jmbg: string | null;
};

export type ChartHeaderAlert = {
  code: AlertCode;
  note: string;
};

type ChartTab = "pregled" | "istorija" | "anamneza" | "zubi";

const tabClass =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-selected:border aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground";

const emptyValue = "—";

export function chartAgeYears(dateOfBirth: string | null, today = new Date()): number | null {
  if (!dateOfBirth) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

type ChartHeaderProps = {
  patient: ChartHeaderPatient;
  patientSlug: string;
  alerts: ChartHeaderAlert[] | null;
  clinical: boolean;
  today: string;
};

export function ChartHeader({ patient, patientSlug, alerts, clinical, today }: ChartHeaderProps) {
  const tabs: ChartTab[] = clinical ? ["pregled", "istorija", "anamneza", "zubi"] : ["pregled", "istorija"];
  const [activeTab, setActiveTab] = useState<ChartTab>("pregled");
  const [editing, setEditing] = useState(false);
  const closeEditor = useCallback(() => setEditing(false), []);
  const age = chartAgeYears(patient.dateOfBirth);
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const birthDate = chartBirthDateLabel(patient.dateOfBirth);
  const showForm = editing && activeTab === "pregled";

  function selectTab(tab: ChartTab) {
    setActiveTab(tab);
    if (tab !== "pregled") setEditing(false);
  }

  function openEditor() {
    setActiveTab("pregled");
    setEditing(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold text-foreground">{fullName}</h1>
          {showForm ? null : (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Izmeni" onClick={openEditor}>
              <PencilSimple />
            </Button>
          )}
        </div>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <dt>Godine:</dt>
            <dd className="text-foreground">{age === null ? emptyValue : `${age} god.`}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Telefon</dt>
            <dd className="text-foreground">{formatPhone(patient.phone) ?? emptyValue}</dd>
          </div>
        </dl>
        {clinical && alerts && alerts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {alerts.map((alert, index) => (
              <li
                key={`${alert.code}-${index}`}
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                <span className="font-medium">{alertCodeLabel(alert.code)}</span>
                <span aria-hidden="true"> · </span>
                <span>{alert.note}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Karton"
          className={cn("flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1")}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`chart-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={`chart-panel-${tab}`}
              className={tabClass}
              onClick={() => selectTab(tab)}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>

        {activeTab === "pregled" ? (
          <section
            role="tabpanel"
            id="chart-panel-pregled"
            aria-labelledby="chart-tab-pregled"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <h2 className="mb-3 text-lg font-semibold">Pregled</h2>
            {showForm ? (
              <ChartDetailsForm
                patient={patient}
                patientSlug={patientSlug}
                clinical={clinical}
                today={today}
                onCancel={closeEditor}
                onSaved={closeEditor}
              />
            ) : (
              <dl className="grid gap-3 text-sm">
                <Field label="Datum rođenja" value={birthDate ?? emptyValue} />
                <Field label="Pol" value={patient.sex ? sexLabel(patient.sex) : emptyValue} />
                <Field label="Mejl" value={patient.email?.trim() || emptyValue} />
                <Field label="Adresa" value={patient.address?.trim() || emptyValue} />
                <Field label="Beleška" value={patient.note?.trim() || emptyValue} />
                {clinical ? <Field label="JMBG" value={patient.jmbg?.trim() || emptyValue} /> : null}
              </dl>
            )}
          </section>
        ) : null}

        {activeTab === "istorija" ? (
          <section
            role="tabpanel"
            id="chart-panel-istorija"
            aria-labelledby="chart-tab-istorija"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <h2 className="text-lg font-semibold">Istorija</h2>
          </section>
        ) : null}

        {clinical && activeTab === "anamneza" ? (
          <section
            role="tabpanel"
            id="chart-panel-anamneza"
            aria-labelledby="chart-tab-anamneza"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <h2 className="text-lg font-semibold">Anamneza</h2>
          </section>
        ) : null}

        {clinical && activeTab === "zubi" ? (
          <section
            role="tabpanel"
            id="chart-panel-zubi"
            aria-labelledby="chart-tab-zubi"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <h2 className="text-lg font-semibold">Zubi</h2>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function tabLabel(tab: ChartTab): string {
  switch (tab) {
    case "pregled":
      return "Pregled";
    case "istorija":
      return "Istorija";
    case "anamneza":
      return "Anamneza";
    case "zubi":
      return "Zubi";
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
