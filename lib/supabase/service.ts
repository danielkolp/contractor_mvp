import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import type { Database } from "./database.types"

// Service-role client — bypasses RLS.
// Only import from server-side code (API routes, server actions).
// Never expose SUPABASE_SERVICE_ROLE_KEY to the client.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for service-role operations."
    )
  }

  return createSupabaseClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
