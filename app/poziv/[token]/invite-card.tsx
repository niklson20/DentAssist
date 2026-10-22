import type { ReactNode } from "react";

export function InviteCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xs">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </section>
  );
}

export function InviteMessage({ title, message }: { title: string; message: string }) {
  return (
    <InviteCard title={title}>
      <p role="alert" className="mt-3 text-sm text-destructive">
        {message}
      </p>
    </InviteCard>
  );
}
