import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PatientEmailTask } from "./email-task";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/app/actions/patients", () => ({
  dismissPatientEmail: vi.fn(),
}));

const birthday = {
  patientSlug: "mina-minic",
  patientName: "Mina Minić",
  hasContact: true,
  dateOfBirth: "2012-03-01",
  email: null as string | null,
  emailDeclined: false,
  onDate: "2027-03-01",
  showName: true,
};

describe("patient email task", () => {
  it("shows the task on the fixed 15th birthday when a contact exists and the email is empty", () => {
    for (const email of [null, "   "]) {
      const html = renderToStaticMarkup(<PatientEmailTask {...birthday} email={email} />);
      expect(html).toContain("Unesite mejl pacijenta");
      expect(html).toContain("Nema mejl");
      expect(html).toContain("Mina Minić");
      expect(html).toContain('href="/pacijenti/mina-minic"');
      expect(html).toContain('name="patientSlug"');
      expect(html).not.toContain('type="email"');
    }
  });

  it("stays hidden the day before that birthday, without a contact, with an email, or when declined", () => {
    const hidden = [
      { ...birthday, onDate: "2027-02-28" },
      { ...birthday, hasContact: false },
      { ...birthday, email: "mina@example.com" },
      { ...birthday, emailDeclined: true },
    ];
    for (const props of hidden) {
      const html = renderToStaticMarkup(<PatientEmailTask {...props} />);
      expect(html).not.toContain("Unesite mejl pacijenta");
      expect(html).not.toContain("Nema mejl");
    }
  });

  it("dismisses the task without writing a parent email onto the child", () => {
    const source = readFileSync(path.join(process.cwd(), "app/actions/patients.ts"), "utf8");
    const start = source.indexOf("export async function dismissPatientEmail");
    const end = source.indexOf("async function findOpenChart");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    const update = body.match(/\.update\(\{([^}]*)\}\)/)?.[1]?.replace(/\s+/g, " ").trim();
    expect(update).toBe("email_declined: true");
    expect(body).not.toContain("patient_contacts");
  });

  it("keeps Supabase out of the task and the screens that show it", () => {
    for (const file of [
      "app/pacijenti/[slug]/email-task.tsx",
      "app/pacijenti/[slug]/page.tsx",
      "app/danas/page.tsx",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source.toLowerCase()).not.toContain("supabase");
    }
  });
});
