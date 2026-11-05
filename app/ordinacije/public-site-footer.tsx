import Link from "next/link";

/** Clears the absolute footer: its height, plus 1rem between the content and the footer. */
export const publicSiteFooterClearance = "pb-[calc(7.25rem+1px)] sm:pb-[calc(5.25rem+1px)]";

export function PublicSiteFooter({ staffEntryUrl }: { staffEntryUrl: string }) {
  return (
    <footer className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={staffEntryUrl}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Za ordinacije
        </Link>
        <p className="text-sm text-muted-foreground">© {copyrightYear()} DentAssist</p>
      </div>
    </footer>
  );
}

function copyrightYear(): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
  }).format(new Date());
}
