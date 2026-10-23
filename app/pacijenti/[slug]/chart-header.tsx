"use client";

import { useState } from "react";

import { alertCodeLabel, sexLabel, type AlertCode, type Sex } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type ChartHeaderPatient = {
  firstName: string;
  lastName: string;
  phone: string | null;
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
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground";

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
  alerts: ChartHeaderAlert[] | null;
  clinical: boolean;
};

export function ChartHeader({ patient, alerts, clinical }: ChartHeaderProps) {
  const tabs: ChartTab[] = clinical ? ["pregled", "istorija", "anamneza", "zubi"] : ["pregled", "istorija"];
  const [activeTab, setActiveTab] = useState<ChartTab>("pregled");
  const age = chartAgeYears(patient.dateOfBirth);
  const fullName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-foreground">{fullName}</h1>
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <dt>Uzrast</dt>
            <dd className="text-foreground">{age === null ? emptyValue : `${age} god.`}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Telefon</dt>
            <dd className="text-foreground">{patient.phone?.trim() || emptyValue}</dd>
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
              onClick={() => setActiveTab(tab)}
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
            <dl className="grid gap-3 text-sm">
              <Field label="Pol" value={patient.sex ? sexLabel(patient.sex) : emptyValue} />
              <Field label="Adresa" value={patient.address?.trim() || emptyValue} />
              <Field label="Beleška" value={patient.note?.trim() || emptyValue} />
              {clinical ? <Field label="JMBG" value={patient.jmbg?.trim() || emptyValue} /> : null}
            </dl>
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
