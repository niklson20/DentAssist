import type { Metadata } from "next";

import { StatisticsMonthField } from "@/app/statistika/month-field";
import { RatingBadge } from "@/app/ordinacije/rating-badge";
import { RatingStars } from "@/app/ordinacije/rating-stars";
import { requireOwner } from "@/lib/auth";
import { formatRatingAverage, formatRatingCount } from "@/lib/ratings";
import {
  loadClinicStatistics,
  resolveStatisticsMonth,
  type DentistMonthStatistics,
} from "@/lib/queries/statistics";

import { loadClinicRatingDetails } from "./actions";
import { RatingDetailsButton } from "./rating-details-button";
import { RatingReviewList } from "./rating-review-list";

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
  const clinicReviews =
    loaded.status === "ready" && loaded.clinicRating
      ? await loadClinicRatingDetails(null)
      : null;

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
        <>
          <section aria-labelledby="ratings-heading" className="space-y-3">
            <h2 id="ratings-heading" className="text-base font-semibold text-foreground">
              Ocene pacijenata
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <span className="text-sm font-medium text-foreground">Ocena ordinacije</span>
              {loaded.clinicRating ? (
                <RatingBadge rating={loaded.clinicRating} />
              ) : (
                <span className="text-sm text-muted-foreground">Još nema ocena</span>
              )}
            </div>
            {clinicReviews ? <RatingReviewList result={clinicReviews} /> : null}
            <p className="text-xs text-muted-foreground">
              Proseci ocena su ukupni i ne zavise od izabranog meseca.
            </p>
          </section>
          <StatisticsTable rows={loaded.rows} />
        </>
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
            <th scope="col" className="border-r border-border px-4 py-3 text-right font-medium">Nedolasci</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Ocena</th>
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
              <td className="border-r border-border px-4 py-3 text-right tabular-nums text-foreground">{row.noShows}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {row.rating ? (
                  <RatingDetailsButton dentistId={row.dentistId} label={row.name}>
                    <span
                      aria-label={`Prosečna ocena ${formatRatingAverage(row.rating.average)} od 5, ${formatRatingCount(row.rating.count)}`}
                      title={`${formatRatingAverage(row.rating.average)}/5 · ${formatRatingCount(row.rating.count)}`}
                      className="whitespace-nowrap"
                    >
                      <RatingStars
                        rating={row.rating.average}
                        label={`Prosek ${formatRatingAverage(row.rating.average)} od 5`}
                        decorative
                      />
                      <span className="ml-1">
                        {formatRatingAverage(row.rating.average)}/5 · {formatRatingCount(row.rating.count)}
                      </span>
                    </span>
                  </RatingDetailsButton>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
