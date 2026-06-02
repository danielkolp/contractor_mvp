// Server-only — never import from client components.
// Manages guest access tokens for one-job portal access without auth.

import { randomBytes } from "crypto"

import { createServiceClient } from "@/lib/supabase/service"

type ServiceClient = ReturnType<typeof createServiceClient>

export type GuestAccess =
  import("@/lib/supabase/database.types").Database["public"]["Tables"]["job_request_guest_access"]["Row"]

export function generateGuestToken(): string {
  return randomBytes(32).toString("hex")
}

export async function createGuestAccess(
  supabase: ServiceClient,
  jobRequestId: string,
  clientEmail: string
): Promise<string | null> {
  const token = generateGuestToken()

  const { error } = await supabase
    .from("job_request_guest_access")
    .insert({ job_request_id: jobRequestId, client_email: clientEmail, token })

  if (error) {
    console.error("[guest-access] createGuestAccess error:", error)
    return null
  }

  return token
}

export async function getGuestAccessByToken(
  supabase: ServiceClient,
  token: string
): Promise<GuestAccess | null> {
  const { data, error } = await supabase
    .from("job_request_guest_access")
    .select("*")
    .eq("token", token)
    .maybeSingle()

  if (error || !data) return null
  return data
}

export async function validateGuestToken(
  supabase: ServiceClient,
  token: string
): Promise<{ jobRequestId: string; clientEmail: string } | null> {
  const access = await getGuestAccessByToken(supabase, token)
  if (!access) return null

  if (access.expires_at && new Date(access.expires_at) < new Date()) {
    return null
  }

  return {
    jobRequestId: access.job_request_id,
    clientEmail:  access.client_email,
  }
}

export async function claimGuestAccess(
  supabase: ServiceClient,
  token: string,
  userId: string
): Promise<{ jobRequestId: string } | null> {
  const access = await getGuestAccessByToken(supabase, token)
  if (!access) return null

  await supabase
    .from("job_request_guest_access")
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq("token", token)

  await supabase
    .from("job_requests")
    .update({ client_id: userId })
    .eq("id", access.job_request_id)

  return { jobRequestId: access.job_request_id }
}
