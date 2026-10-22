import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027120000_set_own_pin.sql"),
  "utf8",
);

describe("set_own_pin migration", () => {
  it("writes only the signed-in member's empty pin hash", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("member.user_id = auth.uid()");
    expect(sql).toContain("and pin_hash is null");
    expect(sql).not.toContain("'pin_hash',");
  });

  it("lets authenticated call both functions and keeps anon and service_role out", () => {
    expect(sql).toContain("grant execute on function public.set_own_pin(text) to authenticated");
    expect(sql).toContain("grant execute on function public.own_pin_is_set() to authenticated");
    expect(sql).not.toMatch(/grant execute on function public\.set_own_pin\(text\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.set_own_pin\(text\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.own_pin_is_set\(\) to anon/);
    expect(sql).not.toMatch(/grant execute on function public\.own_pin_is_set\(\) to service_role/);
    expect(sql).toContain("from public, anon, authenticated, service_role");
  });
});
