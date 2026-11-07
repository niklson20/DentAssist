import type { Metadata } from "next";

import { StatisticsMonthField } from "@/app/statistika/month-field";
import { requireOwner } from "@/lib/auth";
import {
  loadClinicStatistics,
  resolveStatisticsMonth,
  type DentistMonthStatistics,
} from "@/lib/queries/statistics";

export const metadata: Metadata = {
  title: "Statistika — DentAssist",
};

type PageProps = {
  searchParams: Promise<{
    mesec?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  const member = await requireOwner();
  const params = await searchParams;
  const month = resolveStatisticsMonth(params.mesec);
  const loaded = await loadClinicStatistics(member.clinicId, month);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Statistika</h1>
      </header>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Izaberite mesec
          <StatisticsMonthField month={month} />
        </label>
      </form>

      {loaded.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      ) : (
        <StatisticsTable rows={loaded.rows} />
      )}
    </main>
  );
}

function StatisticsTable({ rows }: { rows: DentistMonthStatistics[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nema stomatologa koji primaju pacijente.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="bg-muted text-left text-foreground">
            <th scope="col" className="border-r border-border px-4 py-3 font-medium">Stomatolog</th>
            <th scope="col" className="border-r border-border px-4 py-3 text-right font-medium">Termini</th>
            <th scope="col" className="border-r border-border px-4 py-3 text-right font-medium">Novi pacijenti</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Nedolasci</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dentistId} className="border-t border-border">
              <th scope="row" className="border-r border-border px-4 py-3 text-left font-medium text-foreground">
                {row.name}
              </th>
              <td className="border-r border-border px-4 py-3 text-right tabular-nums text-foreground">{row.appointments}</td>
              <td className="border-r border-border px-4 py-3 text-right tabular-nums text-foreground">{row.newPatients}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">{row.noShows}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
