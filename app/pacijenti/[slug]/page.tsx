import type { Metadata } from "next";

import { loadPatientEmailCharts } from "@/app/actions/patients";
import { requireMember } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";
import { memberRoleLabels } from "@/lib/labels";

import { ChartHeader } from "./chart-header";
import { ConnectParentButton } from "./connect-parent-button";
import { PatientEmailTask } from "./email-task";
import { loadChildChart } from "./load-child-chart";
import { Odontogram } from "./odontogram";
import { BIRTH_DATE_MISSING, CHART_MISSING } from "./schema";

export const metadata: Metadata = {
  title: "Karton — DentAssist",
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const member = await requireMember();
  const chart = await loadChildChart(member.clinicId, slug, member.role);
  const canSend = member.role === "owner" || member.role === "dentist";
  const clinical = member.role === "owner" || member.role === "dentist";

  if (chart.status === "unavailable") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
        <p className="text-sm text-destructive">Karton trenutno nije dostupan. Pokušajte ponovo.</p>
      </main>
    );
  }

  if (chart.status === "missing") {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
        <p className="text-sm text-muted-foreground">{CHART_MISSING}</p>
      </main>
    );
  }

  const onDate = formatBelgradeDate(new Date());
  const emailTasks = await loadPatientEmailCharts(onDate, chart.patient.slug);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
      <ChartHeader
        patient={chart.patient}
        patientSlug={chart.patient.slug}
        patientId={chart.patientId}
        alerts={chart.alerts}
        anamnesis={chart.anamnesis}
        clinical={clinical}
        today={onDate}
        visits={chart.visits}
      />
      {emailTasks.map((patient) => (
        <PatientEmailTask
          key={patient.slug}
          patientSlug={patient.slug}
          patientName={`${patient.firstName} ${patient.lastName}`}
          hasContact={patient.hasContact}
          dateOfBirth={patient.dateOfBirth}
          email={patient.email}
          emailDeclined={patient.emailDeclined}
          onDate={onDate}
        />
      ))}

      {clinical ? (
        <Odontogram actor={memberRoleLabels[member.role]} panelId="chart-panel-zubi" />
      ) : null}

      {canSend && chart.connect.kind === "needsBirthDate" ? (
        <p className="text-sm text-muted-foreground">{BIRTH_DATE_MISSING}</p>
      ) : null}

      {canSend && chart.connect.kind === "ready" ? (
        <ConnectParentButton patientSlug={chart.patient.slug} contacts={chart.connect.contacts} />
      ) : null}
    </main>
  );
}
