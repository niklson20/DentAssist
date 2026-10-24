import { timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { due_reminders } from "@/lib/mail";

const JOBS = ["expire_booking_requests", "purge_booking_request_pii"] as const;

/** Vercel calls this once an hour. */
export async function GET(request: Request): Promise<Response> {
  if (!bearerMatches(request, process.env.CRON_SECRET)) {
    return new Response(null, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("cron jobs failed: Supabase environment is not set");
    return new Response(null, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let failed = false;
  for (const name of JOBS) {
    try {
      const { error } = await supabase.rpc(name);
      if (error) {
        console.error(`${name} rejected:`, error.code ?? "unknown");
        failed = true;
      }
    } catch (error) {
      console.error(`${name} failed:`, error instanceof Error ? error.name : "unknown error");
      failed = true;
    }
  }

  try {
    if (await due_reminders(supabase)) failed = true;
  } catch (error) {
    console.error("due_reminders failed:", error instanceof Error ? error.name : "unknown error");
    failed = true;
  }

  return new Response(null, { status: failed ? 500 : 200 });
}

function bearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer (.+)$/i.exec(header) : null;
  const token = match?.[1];
  if (!token) {
    return false;
  }
  const given = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (given.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(given, expected);
}
