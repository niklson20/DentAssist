import { PublicSiteNav } from "../public-site-nav";

export function PatientAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <PublicSiteNav />
      <main className="flex flex-1 items-center justify-center p-4">{children}</main>
    </div>
  );
}
