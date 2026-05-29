import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

export type UserRole = Database["public"]["Enums"]["user_role"]

export function dashboardPathForRole(role: UserRole | null | undefined) {
  return role === "client" ? "/client/dashboard" : "/dashboard"
}

export async function getProfileRole(
  supabase: SupabaseClient<Database>,
  userId: string,
  // Fallback for when the role column doesn't exist in profiles yet.
  // user.user_metadata is set at signup and is authoritative for new users.
  userMetadata?: Record<string, unknown>
): Promise<UserRole> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle()

  const profileRole: UserRole | null = error ? null : (data?.role ?? null)

  const metaRole: UserRole | null =
    userMetadata?.role === "client" ? "client"
    : userMetadata?.role === "contractor" ? "contractor"
    : null

  // Profile role wins when it's set. Fall back to metadata when the column
  // doesn't exist or returned null (migration not yet applied).
  return profileRole ?? metaRole ?? "contractor"
}
