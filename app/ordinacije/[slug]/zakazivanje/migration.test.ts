import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027180000_self_chart_linked.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("$$;", open);
  return sql.slice(open, close).toLowerCase();
}

describe("self_chart_linked", () => {
  it("checks only this clinic and the signed-in account, without a chart name", () => {
    const body = functionBody("self_chart_linked");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("from public.patient_accounts as account");
    expect(body).toContain("account.user_id = auth.uid()");
    expect(body).toContain("from public.patient_chart_links as link");
    expect(body).toContain("link.account_id = v_account_id");
    expect(body).toContain("link.dependent_id is null");
    expect(body).toContain("lower(clinic.slug) = v_slug");
    expect(body).not.toContain("from public.patients");
    expect(body).not.toContain("first_name");
    expect(body).not.toContain("last_name");
    expect(body).not.toMatch(/\bjmbg\b/);

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("grant execute on function public.self_chart_linked(text) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.self_chart_linked\(text\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.self_chart_linked\(text\) to service_role/);
  });
});
