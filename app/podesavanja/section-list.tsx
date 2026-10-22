import Link from "next/link";

import type { SettingsSection } from "./sections";

type Props = {
  sections: readonly SettingsSection[];
};

export function SettingsSectionList({ sections }: Props) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card text-card-foreground">
      {sections.map((section) => (
        <li key={section.href}>
          <Link
            href={section.href}
            className="flex flex-col gap-1 p-4 transition-colors hover:bg-muted"
          >
            <span className="font-medium">{section.title}</span>
            <span className="text-sm text-muted-foreground">{section.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
