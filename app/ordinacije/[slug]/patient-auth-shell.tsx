import { PublicSiteFooter, publicSiteFooterClearance } from "../public-site-footer";
import { PublicSiteNav } from "../public-site-nav";
import { resolveStaffEntryUrl } from "../staff-entry-url";

export async function PatientAuthShell({ children }: { children: React.ReactNode }) {
  const staffEntryUrl = await resolveStaffEntryUrl();

  return (
    <div className="relative flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav />
      <main
        className={`flex flex-1 items-center justify-center p-4 ${publicSiteFooterClearance}`}
      >
        {children}
      </main>
      <PublicSiteFooter staffEntryUrl={staffEntryUrl} />
    </div>
  );
}
