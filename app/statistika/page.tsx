import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { requireOwner } from "@/lib/auth";
import {
  formatStatisticsMonthLabel,
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
        <p className="mt-1 text-sm text-muted-foreground">
          Brojevi po stomatologu za izabrani mesec u zoni Beograda.
        </p>
      </header>

      <section aria-labelledby="statistics-month-heading" className="space-y-4">
        <h2 id="statistics-month-heading" className="text-sm font-medium text-foreground">
          Mesec
        </h2>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            Izaberite mesec
            <input
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm"
              type="month"
              name="mesec"
              value={month}
              required
            />
          </label>
          <Button type="submit" variant="secondary">Prikaži</Button>
        </form>
      </section>

      {loaded.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Podaci trenutno nisu dostupni. Pokušajte ponovo.</p>
      ) : (
        <StatisticsTable monthLabel={formatStatisticsMonthLabel(loaded.month)} rows={loaded.rows} />
      )}
    </main>
  );
}

function StatisticsTable({
  monthLabel,
  rows,
}: {
  monthLabel: string;
  rows: DentistMonthStatistics[];
}) {
  return (
    <section aria-labelledby="statistics-table-heading" className="space-y-3">
      <h2 id="statistics-table-heading" className="text-sm font-medium text-foreground">
        {monthLabel}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema stomatologa koji primaju pacijente.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Stomatolog</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Termini</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Novi pacijenti</th>
                <th scope="col" className="px-3 py-2 font-medium text-right">Nedolasci</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dentistId} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">
                    {row.name}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.appointments}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.newPatients}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
