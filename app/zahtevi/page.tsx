import type { Metadata } from "next";

import { loadPendingRequests } from "@/app/actions/appointments";
import { loadPatientEmailCharts } from "@/app/actions/patients";
import { PendingColumn } from "@/app/danas/pending-column";
import { PhoneBar } from "@/app/danas/phone-bar";
import { PatientEmailTask } from "@/app/pacijenti/[slug]/email-task";
import { requireMember } from "@/lib/auth";
import { formatBelgradeDate } from "@/lib/calendar-dates";

export const metadata: Metadata = {
  title: "Zahtevi — DentAssist",
};

export default async function Page() {
  const member = await requireMember();
  const onDate = formatBelgradeDate(new Date());
  const [pending, emailTasks] = await Promise.all([
    loadPendingRequests(),
    loadPatientEmailCharts(onDate),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pb-24 md:pb-4">
      <h1 className="text-2xl font-semibold text-foreground">Zahtevi</h1>
      <PendingColumn
        role={member.role}
        requests={pending.ok ? pending.data : []}
        error={pending.ok ? null : pending.error}
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
          showName
        />
      ))}
      <div className="md:hidden">
        <PhoneBar />
      </div>
    </main>
  );
}
