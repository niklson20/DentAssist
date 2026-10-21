import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { REMEMBER_COOKIE, sessionCookieOptions } from "@/lib/supabase/cookies";

export {
  REMEMBER_COOKIE,
  REMEMBER_MAX_AGE_SECONDS,
  sessionCookieDomain,
  sessionCookieOptions,
} from "@/lib/supabase/cookies";

export async function createSupabaseServerClient({ remember }: { remember?: boolean } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase environment variables are not set.");
  }

  const store = await cookies();
  const rememberSession = remember ?? store.get(REMEMBER_COOKIE)?.value === "1";

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, sessionCookieOptions(options, rememberSession));
          }
        } catch {
          // Server Components cannot write cookies; Server Actions and route handlers can.
        }
      },
    },
  });
}
