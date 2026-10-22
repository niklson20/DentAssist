import { SettingsPinForm } from "./pin-gate-form";
import type { SettingsPinGate } from "./load-pin-gate";

export function SettingsPinView({ gate }: { gate: Exclude<SettingsPinGate, { status: "open" }> }) {
  if (gate.status === "unavailable") {
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-card-foreground">
        <h1 className="text-2xl font-semibold">PIN vlasnika</h1>
        <p className="mt-4 text-sm text-destructive" role="alert">
          PIN trenutno nije dostupan. Pokušajte ponovo.
        </p>
      </section>
    );
  }

  return <SettingsPinForm pinSet={gate.pinSet} />;
}
