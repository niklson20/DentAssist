import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027160000_confirm_child_link.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("$$;", open);
  return sql.slice(open, close).toLowerCase();
}

describe("confirm child link migration", () => {
  it("does not select a child name before confirmation", () => {
    const preview = functionBody("preview_child_link");
    expect(preview).not.toContain("first_name");
    expect(preview).not.toContain("last_name");
    expect(preview).not.toContain("public.patients");
    expect(preview).not.toContain("patient_dependents");
  });

  it("adds the child on confirmation and does not write the chart email", () => {
    const confirm = functionBody("confirm_child_link");
    expect(confirm).toContain("insert into public.patient_dependents");
    expect(confirm).not.toContain("update public.patients");
    expect(confirm).not.toContain("patients.email");
    expect(sql).toContain("grant execute on function public.preview_child_link(text, text) to authenticated");
    expect(sql).toContain("grant execute on function public.confirm_child_link(text, text) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.preview_child_link\(text, text\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.confirm_child_link\(text, text\) to service_role/);
    expect(sql).toContain("revoke update on table public.patient_link_invites from authenticated");
    expect(sql).toContain("as restrictive");
  });
});
