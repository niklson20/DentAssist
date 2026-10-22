import { formatBelgrade, isIsoDate, startOfBelgradeDay } from "@/lib/calendar-dates";
import { relationshipLabel } from "@/lib/labels";

import type { AccountChild } from "./load-children";

export function ChildrenList({ items }: { items: AccountChild[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Još nema dece na nalogu.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((child) => (
        <li key={child.id} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          <p className="font-medium">
            {child.firstName} {child.lastName}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatChildBirth(child.dateOfBirth)} · {relationshipLabel(child.relationship)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function formatChildBirth(value: string): string {
  if (!isIsoDate(value)) {
    return value;
  }
  return formatBelgrade(startOfBelgradeDay(value), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
