import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "@playwright/test";

const PRODUCTION_REF = "iirzzaykgskjouzzvdrd";
const TEST_REF = "hmkxuvwpjvzekpvpmsuk";

export function assertSupabaseTarget(url: string, variableName: string): void {
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(`Refusing production ref ${PRODUCTION_REF}`);
  }
  if (!url.includes(TEST_REF)) {
    throw new Error(variableName);
  }
}

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function requireTarget(variableName: string): void {
  const value = process.env[variableName] ?? "";
  if (value === "") throw new Error(variableName);
  assertSupabaseTarget(value, variableName);
}

loadEnvLocal();
requireTarget("NEXT_PUBLIC_SUPABASE_URL");
if ((process.env.SUPABASE_DB_URL ?? "") !== "") {
  requireTarget("SUPABASE_DB_URL");
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "line",
  use: {
    trace: "off",
  },
});
