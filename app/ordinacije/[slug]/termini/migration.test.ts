import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027170000_list_my_appointments.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  const open = sql.indexOf("as $$", start);
  const close = sql.indexOf("$$;", open);
  return sql.slice(open, close).toLowerCase();
}

describe("list_my_appointments", () => {
  it("returns one clinic and the signed-in email, without chart text", () => {
    const body = functionBody("list_my_appointments");

    expect(body).toContain("auth.uid()");
    expect(body).toContain("from public.patient_accounts as account");
    expect(body).toContain("account.user_id = auth.uid()");
    expect(body).toContain("lower(clinic.slug) = v_slug");
    expect(body).toContain("lower(request.booker_email) = v_email");
    expect(body).toContain("lower(patient.email) = v_email");
    expect(body).toContain("lower(contact.email) = v_email");
    expect(body).toContain("member.first_name");
    expect(body).toContain("member.last_name");
    expect(body).not.toContain("patient.first_name");
    expect(body).not.toContain("patient.last_name");
    expect(body).not.toMatch(/\breason\b/);
    expect(body).not.toMatch(/\bnote\b/);
    expect(body).not.toMatch(/\bvisits\b/);
    expect(body).not.toMatch(/\bpatient_files\b/);
    expect(body).not.toMatch(/\bjmbg\b/);

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("grant execute on function public.list_my_appointments(text) to authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.list_my_appointments\(text\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.list_my_appointments\(text\) to service_role/);
  });
});
