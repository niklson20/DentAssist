import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCTION_REF = "iirzzaykgskjouzzvdrd";

const PROJECT_REF = /^[a-z0-9]{20}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function projectRefFromUrl(value) {
  const raw = value.trim();
  if (!raw) {
    return "";
  }
  try {
    const host = new URL(raw).hostname;
    if (!host.endsWith(".supabase.co")) {
      return "";
    }
    return host.slice(0, -".supabase.co".length);
  } catch {
    return "";
  }
}

export function envProjectRefs(env) {
  const refs = [];
  const explicit = (env.SUPABASE_PROJECT_REF ?? "").trim();
  if (explicit) {
    refs.push(explicit);
  }
  for (const key of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    const ref = projectRefFromUrl(env[key] ?? "");
    if (ref && !refs.includes(ref)) {
      refs.push(ref);
    }
  }
  return refs;
}

export function planReset({ linkedRef, envRefs }) {
  const linked = linkedRef.trim();
  const extras = envRefs.map((ref) => ref.trim()).filter(Boolean);
  if (linked === PRODUCTION_REF || extras.some((ref) => ref === PRODUCTION_REF)) {
    return {
      ok: false,
      error: `db:reset refused: project ${PRODUCTION_REF} is protected.`,
    };
  }
  if (!PROJECT_REF.test(linked)) {
    return { ok: false, error: "db:reset refused: linked project ref is not set." };
  }
  if (extras.some((ref) => ref !== linked)) {
    return {
      ok: false,
      error: "db:reset refused: project ref does not match the linked project.",
    };
  }
  return { ok: true, ref: linked };
}

function readLinkedRef() {
  const file = path.join(root, "supabase", ".temp", "project-ref");
  if (!existsSync(file)) {
    return "";
  }
  return readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim();
}

function migrationFiles() {
  const dir = path.join(root, "supabase", "migrations");
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).filter((name) => name.endsWith(".sql"));
}

function readEnvFile(name) {
  const file = path.join(root, name);
  const values = new Map();
  if (!existsSync(file)) {
    return values;
  }
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function loadEnvLocal() {
  const values = readEnvFile(".env");
  for (const [key, value] of readEnvFile(".env.local")) {
    values.set(key, value);
  }
  for (const [key, value] of values) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function runSupabase(args) {
  const result = spawnSync("npx", ["--yes", "supabase", ...args], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

function main() {
  loadEnvLocal();
  const command = process.argv[2];
  const linkedRef = readLinkedRef();

  if (command === "migrate") {
    if (migrationFiles().length === 0) {
      console.log("No migrations to apply.");
      return;
    }
    if (!PROJECT_REF.test(linkedRef)) {
      console.error("db:migrate refused: linked project ref is not set.");
      process.exit(1);
    }
    process.exit(runSupabase(["db", "push", "--linked"]));
  }

  if (command === "backup") {
    if (!PROJECT_REF.test(linkedRef)) {
      console.error("db:backup refused: linked project ref is not set.");
      process.exit(1);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    mkdirSync(path.join(root, "backups"), { recursive: true });
    const schemaStatus = runSupabase([
      "db",
      "dump",
      "--linked",
      "--file",
      `backups/${stamp}-schema.sql`,
    ]);
    if (schemaStatus !== 0) {
      process.exit(schemaStatus);
    }
    process.exit(
      runSupabase([
        "db",
        "dump",
        "--linked",
        "--data-only",
        "--file",
        `backups/${stamp}-data.sql`,
      ]),
    );
  }

  if (command === "reset") {
    const decision = planReset({ linkedRef, envRefs: envProjectRefs(process.env) });
    if (!decision.ok) {
      console.error(decision.error);
      process.exit(1);
    }
    process.exit(runSupabase(["db", "reset", "--linked"]));
  }

  console.error("Usage: node scripts/db.mjs <migrate|backup|reset>");
  process.exit(1);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main();
}
