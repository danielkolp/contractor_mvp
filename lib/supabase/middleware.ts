import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "./database.types"

/**
 * Refreshes the Supabase auth session on every matched request.
 *
 * Without this, a contractor's short-lived access token (default 1h) is never
 * refreshed on the server, so Server Components calling `auth.getUser()` can
 * see an expired token and bounce the user to /login even though they hold a
 * valid refresh token. This is the canonical @supabase/ssr pattern: it only
 * refreshes cookies — it deliberately does NOT add redirects, leaving route
 * protection to the existing layout-level `getUser()` checks.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // If env is not configured (e.g. preview without secrets), do nothing.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return response
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: object }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touching getUser() triggers a token refresh when needed; the refreshed
  // cookies are written onto `response` via setAll above.
  await supabase.auth.getUser()

  return response
}
