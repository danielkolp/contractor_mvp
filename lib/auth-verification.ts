import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase()
}

export function emailVerificationRedirectUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/auth/callback`
}

export async function resendSignupVerificationEmail(
  supabase: SupabaseClient<Database>,
  email: string,
  origin: string
) {
  return supabase.auth.resend({
    type: "signup",
    email: normalizeAuthEmail(email),
    options: {
      emailRedirectTo: emailVerificationRedirectUrl(origin),
    },
  })
}
