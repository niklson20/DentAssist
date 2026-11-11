"use client";

import { useCallback, useState } from "react";
import { PencilSimple } from "@phosphor-icons/react";

import type { PatientDocument } from "@/app/actions/files";
import { Button } from "@/components/ui/button";
import { alertCodeLabel, sexLabel, type AlertCode, type Sex } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

import { normalizeAnamnesis, type ChartAnamnesis } from "./anamnesis";
import { AnamnesisForm, AnamnesisView } from "./anamnesis-form";
import { ChartDetailsForm, chartBirthDateLabel } from "./chart-details-form";
import { DocumentsDialog } from "./documents-dialog";
import { VisitHistory, type VisitHistoryItem } from "./history";

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

type ChartTab = "pregled" | "istorija" | "anamneza" | "zubi" | "dokumenti";

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
  patientId?: string;
  alerts: ChartHeaderAlert[] | null;
  anamnesis?: ChartAnamnesis | null;
  clinical: boolean;
  today: string;
  visits: readonly VisitHistoryItem[];
  role?: "owner" | "dentist" | "reception";
  documents?: readonly PatientDocument[];
  documentsNow?: string;
};

export function ChartHeader({
  patient,
  patientSlug,
  patientId,
  alerts,
  anamnesis = null,
  clinical,
  today,
  visits,
  role,
  documents = [],
  documentsNow,
}: ChartHeaderProps) {
  const showDocuments =
    Boolean(patientId) &&
    Boolean(documentsNow) &&
    (role === "owner" || role === "dentist");
  const tabs: ChartTab[] = clinical
    ? showDocuments
      ? ["pregled", "istorija", "anamneza", "zubi", "dokumenti"]
      : ["pregled", "istorija", "anamneza", "zubi"]
    : ["pregled", "istorija"];
  const [activeTab, setActiveTab] = useState<ChartTab>("pregled");
  const [editing, setEditing] = useState(false);
  const closeEditor = useCallback(() => setEditing(false), []);
  const age = chartAgeYears(patient.dateOfBirth);
  const fullName = `${patient.firstName} ${patient.lastName}`;
  const birthDate = chartBirthDateLabel(patient.dateOfBirth);
  const showDetailsForm = editing && activeTab === "pregled";
  const showAnamnesisForm = editing && activeTab === "anamneza" && Boolean(patientId);
  const canEdit = activeTab === "pregled" || (activeTab === "anamneza" && Boolean(patientId));
  const anamnesisValues = normalizeAnamnesis(anamnesis);

  function selectTab(tab: ChartTab) {
    setActiveTab(tab);
    setEditing(false);
  }

  function openEditor() {
    if (activeTab !== "pregled" && activeTab !== "anamneza") {
      setActiveTab("pregled");
    }
    setEditing(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold text-foreground">{fullName}</h1>
          {canEdit && !showDetailsForm && !showAnamnesisForm ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Izmeni" onClick={openEditor}>
              <PencilSimple />
            </Button>
          ) : null}
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
          <div className="flex gap-1">
            <dt>Mejl</dt>
            <dd className="text-foreground">{patient.email?.trim() || emptyValue}</dd>
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
            {showDetailsForm ? (
              <ChartDetailsForm
                patient={patient}
                patientSlug={patientSlug}
                clinical={clinical}
                today={today}
                onCancel={closeEditor}
                onSaved={closeEditor}
              />
            ) : (
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                <Field label="Datum rođenja" value={birthDate ?? emptyValue} />
                <Field label="Pol" value={patient.sex ? sexLabel(patient.sex) : emptyValue} />
                <Field label="Adresa" value={patient.address?.trim() || emptyValue} className="sm:col-span-2" />
                <Field label="Beleška" value={patient.note?.trim() || emptyValue} className="sm:col-span-2" />
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
            <VisitHistory visits={visits} />
          </section>
        ) : null}

        {clinical && activeTab === "anamneza" ? (
          <section
            role="tabpanel"
            id="chart-panel-anamneza"
            aria-labelledby="chart-tab-anamneza"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            {showAnamnesisForm && patientId ? (
              <AnamnesisForm
                patientId={patientId}
                anamnesis={anamnesisValues}
                onCancel={closeEditor}
                onSaved={closeEditor}
              />
            ) : (
              <AnamnesisView anamnesis={anamnesisValues} />
            )}
          </section>
        ) : null}

        {clinical && activeTab === "zubi" ? (
          <section
            role="tabpanel"
            id="chart-panel-zubi"
            aria-labelledby="chart-tab-zubi"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          />
        ) : null}

        {showDocuments && patientId && documentsNow && role && activeTab === "dokumenti" ? (
          <section
            role="tabpanel"
            id="chart-panel-dokumenti"
            aria-labelledby="chart-tab-dokumenti"
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <DocumentsDialog
              patientId={patientId}
              role={role}
              documents={documents}
              now={new Date(documentsNow)}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function tabLabel(tab: ChartTab): string {
  switch (tab) {
    case "pregled":
      return "Informacije";
    case "istorija":
      return "Istorija";
    case "anamneza":
      return "Anamneza";
    case "zubi":
      return "Zubi";
    case "dokumenti":
      return "Dokumenti";
  }
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
