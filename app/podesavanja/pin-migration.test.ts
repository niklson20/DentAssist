import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027130000_read_owner_settings_pin.sql"),
  "utf8",
);

describe("read_owner_settings_pin migration", () => {
  it("returns the signed-in owner's hash and hides it otherwise", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("auth.uid() is null or not public.is_owner()");
    expect(sql).toContain("member.user_id = auth.uid()");
    expect(sql).toContain("and member.role = 'owner'");
    expect(sql).toContain("return jsonb_build_object('status', 'invalid');");
    expect(sql).toContain("return jsonb_build_object('status', 'unset');");
    expect(sql).toContain("return jsonb_build_object('status', 'ready', 'pin_hash', v_hash);");
    expect(sql).not.toContain("pin_attempt_count");
  });

  it("lets authenticated call it and keeps anon and service_role out", () => {
    expect(sql).toContain("grant execute on function public.read_owner_settings_pin() to authenticated");
    expect(sql).toContain("from public, anon, authenticated, service_role");
    expect(sql).not.toMatch(/grant execute on function public\.read_owner_settings_pin\(\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.read_owner_settings_pin\(\) to service_role/);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});
